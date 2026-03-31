<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

maybe_handle_preflight();

try {
    $route = get_route_path();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($route === '/' || $route === '/test') {
        write_request_log(200, 'healthcheck');
        json_response(['message' => 'DreamHost PHP API is running.']);
    }

    require_api_token();
    $pdo = db();

    if ($route === '/invoices' && $method === 'GET') {
        $rows = $pdo->query("SELECT * FROM ABC_Invoices ORDER BY STR_TO_DATE(`Due Date`, '%m/%d/%Y') DESC")->fetchAll();
        $rows = array_map(static function (array $row): array {
            $row['Due Date'] = format_us_date($row['Due Date'] ?? null);
            $row['Action Date'] = format_us_date($row['Action Date'] ?? null);
            return $row;
        }, $rows);
        write_request_log(200, 'invoices_list');
        json_response($rows);
    }

    if ($route === '/invoices/update' && $method === 'POST') {
        $body = request_json_body();
        $invoiceId = $body['invoiceId'] ?? '';
        $existsStmt = $pdo->prepare('SELECT 1 FROM `ABC_Invoices` WHERE `Invoice` = ? LIMIT 1');
        $existsStmt->execute([$invoiceId]);
        if (!$existsStmt->fetchColumn()) {
            json_response(['error' => 'Invoice not found'], 404);
        }
        $stmt = $pdo->prepare('UPDATE `ABC_Invoices` SET `Note` = ?, `Action Date` = ? WHERE `Invoice` = ?');
        $stmt->execute([
            $body['note'] ?? '',
            parse_date_or_null($body['actionDate'] ?? null),
            $invoiceId,
        ]);
        $updatedStmt = $pdo->prepare('SELECT * FROM `ABC_Invoices` WHERE `Invoice` = ? LIMIT 1');
        $updatedStmt->execute([$invoiceId]);
        $updatedRow = $updatedStmt->fetch() ?: null;
        write_request_log(200, 'invoice_updated');
        json_response([
            'success' => true,
            'message' => 'Invoice updated successfully',
            'rowCount' => $stmt->rowCount(),
            'record' => $updatedRow,
        ]);
    }

    if ($route === '/invoices/download' && $method === 'GET') {
        $rows = $pdo->query("SELECT * FROM ABC_Invoices ORDER BY STR_TO_DATE(`Due Date`, '%m/%d/%Y') DESC")->fetchAll();
        write_request_log(200, 'invoices_download');
        csv_response('invoices_' . current_download_date() . '.csv', $rows);
    }

    if ($route === '/past-due/staging' && $method === 'POST') {
        $data = request_json_body();

        // Full schema — matches ABC_Invoices exactly so SELECT * syncs cleanly
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS Staging (
                `Invoice` VARCHAR(255),
                `Due Date` VARCHAR(255),
                `Note` TEXT,
                `Action Date` DATE,
                `Customer Name` VARCHAR(255),
                `Service Location` VARCHAR(255),
                `Rows` VARCHAR(255),
                `Customer Email` VARCHAR(255),
                `PO Number` VARCHAR(255),
                `Phone 1` VARCHAR(255),
                `Phone 2` VARCHAR(255),
                `Total Amount` DECIMAL(10,2),
                `Customer Address` TEXT,
                `Service Location Contact` VARCHAR(255),
                `Service Location Phone` VARCHAR(255),
                `Parent Customer Name` VARCHAR(255),
                `Parent Customer Phone` VARCHAR(255),
                `Parent Customer Address` TEXT
            )
        ");

        // Add any columns that are missing from older Staging tables
        $extraCols = [
            'Rows'                     => 'VARCHAR(255)',
            'Customer Email'           => 'VARCHAR(255)',
            'PO Number'                => 'VARCHAR(255)',
            'Phone 1'                  => 'VARCHAR(255)',
            'Phone 2'                  => 'VARCHAR(255)',
            'Total Amount'             => 'DECIMAL(10,2)',
            'Customer Address'         => 'TEXT',
            'Service Location Contact' => 'VARCHAR(255)',
            'Service Location Phone'   => 'VARCHAR(255)',
            'Parent Customer Name'     => 'VARCHAR(255)',
            'Parent Customer Phone'    => 'VARCHAR(255)',
            'Parent Customer Address'  => 'TEXT',
        ];
        foreach ($extraCols as $col => $type) {
            try {
                $pdo->exec("ALTER TABLE Staging ADD COLUMN `{$col}` {$type}");
            } catch (Throwable $e) {
                // Column already exists — safe to ignore
            }
        }

        // Also ensure ABC_Invoices has all the extra columns
        foreach ($extraCols as $col => $type) {
            try {
                $pdo->exec("ALTER TABLE ABC_Invoices ADD COLUMN `{$col}` {$type}");
            } catch (Throwable $e) {
                // Column already exists — safe to ignore
            }
        }

        $pdo->exec('TRUNCATE TABLE Staging');

        $stmt = $pdo->prepare('
            INSERT INTO Staging (
                `Invoice`, `Due Date`, `Note`, `Action Date`, `Customer Name`, `Service Location`,
                `Rows`, `Customer Email`, `PO Number`, `Phone 1`, `Phone 2`, `Total Amount`,
                `Customer Address`, `Service Location Contact`, `Service Location Phone`,
                `Parent Customer Name`, `Parent Customer Phone`, `Parent Customer Address`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ');

        foreach ($data as $row) {
            if (!is_array($row)) {
                continue;
            }
            $stmt->execute([
                $row['Invoice'] ?? $row['#'] ?? '',
                $row['Due Date'] ?? '',
                $row['Note'] ?? '',
                parse_date_or_null($row['Action Date'] ?? null),
                $row['Customer Name'] ?? '',
                $row['Service Location'] ?? '',
                $row['Rows'] ?? null,
                $row['Customer Email'] ?? null,
                $row['PO Number'] ?? null,
                $row['Phone 1'] ?? null,
                $row['Phone 2'] ?? null,
                parse_decimal_or_null($row['Total Amount'] ?? null),
                $row['Customer Address'] ?? null,
                $row['Service Location Contact'] ?? null,
                $row['Service Location Phone'] ?? null,
                $row['Parent Customer Name'] ?? null,
                $row['Parent Customer Phone'] ?? null,
                $row['Parent Customer Address'] ?? null,
            ]);
        }

        write_request_log(200, 'past_due_staging_loaded');
        json_response(['success' => true]);
    }

    if ($route === '/past-due/update' && $method === 'POST') {
        // Remove invoices no longer in the file
        $pdo->exec('DELETE FROM ABC_Invoices WHERE Invoice NOT IN (SELECT Invoice FROM Staging)');

        // Update billing columns on existing invoices.
        // Note and Action Date are intentionally excluded so staff edits are never overwritten.
        $pdo->exec('
            UPDATE ABC_Invoices ai
            JOIN Staging s ON ai.Invoice = s.Invoice
            SET
                ai.`Due Date`                 = s.`Due Date`,
                ai.`Customer Name`            = s.`Customer Name`,
                ai.`Service Location`         = s.`Service Location`,
                ai.`Rows`                     = s.`Rows`,
                ai.`Customer Email`           = s.`Customer Email`,
                ai.`PO Number`                = s.`PO Number`,
                ai.`Phone 1`                  = s.`Phone 1`,
                ai.`Phone 2`                  = s.`Phone 2`,
                ai.`Total Amount`             = s.`Total Amount`,
                ai.`Customer Address`         = s.`Customer Address`,
                ai.`Service Location Contact` = s.`Service Location Contact`,
                ai.`Service Location Phone`   = s.`Service Location Phone`,
                ai.`Parent Customer Name`     = s.`Parent Customer Name`,
                ai.`Parent Customer Phone`    = s.`Parent Customer Phone`,
                ai.`Parent Customer Address`  = s.`Parent Customer Address`
        ');

        // Insert brand-new invoices from the file
        $pdo->exec('
            INSERT INTO ABC_Invoices (
                `Invoice`, `Due Date`, `Note`, `Action Date`, `Customer Name`, `Service Location`,
                `Rows`, `Customer Email`, `PO Number`, `Phone 1`, `Phone 2`, `Total Amount`,
                `Customer Address`, `Service Location Contact`, `Service Location Phone`,
                `Parent Customer Name`, `Parent Customer Phone`, `Parent Customer Address`
            )
            SELECT
                `Invoice`, `Due Date`, `Note`, `Action Date`, `Customer Name`, `Service Location`,
                `Rows`, `Customer Email`, `PO Number`, `Phone 1`, `Phone 2`, `Total Amount`,
                `Customer Address`, `Service Location Contact`, `Service Location Phone`,
                `Parent Customer Name`, `Parent Customer Phone`, `Parent Customer Address`
            FROM Staging
            WHERE Invoice NOT IN (SELECT Invoice FROM ABC_Invoices)
        ');

        write_request_log(200, 'past_due_sync_complete');
        json_response(['success' => true]);
    }

    if ($route === '/quotes' && $method === 'GET') {
        $rows = $pdo->query('SELECT * FROM `Quotes` ORDER BY `Quote` DESC')->fetchAll();
        $rows = array_map(static function (array $row): array {
            $row['Action Date'] = format_us_date($row['Action Date'] ?? null);
            return $row;
        }, $rows);
        write_request_log(200, 'quotes_list');
        json_response($rows);
    }

    if ($route === '/quotes/update' && $method === 'POST') {
        $body = request_json_body();
        $quoteId = $body['quoteId'] ?? '';
        $existsStmt = $pdo->prepare('SELECT 1 FROM `Quotes` WHERE `Quote` = ? LIMIT 1');
        $existsStmt->execute([$quoteId]);
        if (!$existsStmt->fetchColumn()) {
            json_response(['error' => 'Quote not found'], 404);
        }
        $stmt = $pdo->prepare('UPDATE `Quotes` SET `Note` = ?, `Action Date` = ? WHERE `Quote` = ?');
        $stmt->execute([
            $body['note'] ?? '',
            parse_date_or_null($body['actionDate'] ?? null),
            $quoteId,
        ]);
        $updatedStmt = $pdo->prepare('SELECT * FROM `Quotes` WHERE `Quote` = ? LIMIT 1');
        $updatedStmt->execute([$quoteId]);
        $updatedRow = $updatedStmt->fetch() ?: null;
        write_request_log(200, 'quote_updated');
        json_response([
            'success' => true,
            'message' => 'Quote updated successfully',
            'rowCount' => $stmt->rowCount(),
            'record' => $updatedRow,
        ]);
    }

    if ($route === '/quotes/download' && $method === 'GET') {
        $rows = $pdo->query('SELECT * FROM `Quotes` ORDER BY `Quote` DESC')->fetchAll();
        write_request_log(200, 'quotes_download');
        csv_response('quotes_' . current_download_date() . '.csv', $rows);
    }

    if ($route === '/quotes/staging' && $method === 'POST') {
        $data = request_json_body();
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS Quotes_Staging (
                `Quote` VARCHAR(255),
                `Name` VARCHAR(255),
                `Note` TEXT,
                `Action Date` DATE,
                `Total Amount` DECIMAL(10,2)
            )
        ");
        $pdo->exec('TRUNCATE TABLE Quotes_Staging');

        $stmt = $pdo->prepare('
            INSERT INTO Quotes_Staging (`Quote`, `Name`, `Note`, `Action Date`, `Total Amount`)
            VALUES (?, ?, ?, ?, ?)
        ');

        foreach ($data as $row) {
            if (!is_array($row)) {
                continue;
            }
            $stmt->execute([
                $row['Quote'] ?? '',
                $row['Name'] ?? '',
                $row['Note'] ?? '',
                parse_date_or_null($row['Action Date'] ?? null),
                parse_decimal_or_null($row['Total Amount'] ?? $row['Amount'] ?? null) ?? 0,
            ]);
        }

        write_request_log(200, 'quotes_staging_loaded');
        json_response(['success' => true]);
    }

    if ($route === '/quotes/update-from-staging' && $method === 'POST') {
        $deleted = $pdo->exec('DELETE FROM Quotes WHERE Quote NOT IN (SELECT Quote FROM Quotes_Staging)');
        $inserted = $pdo->exec('
            INSERT INTO Quotes (`Quote`, `Name`, `Note`, `Action Date`, `Total Amount`)
            SELECT qs.`Quote`, qs.`Name`, qs.`Note`, qs.`Action Date`, qs.`Total Amount`
            FROM Quotes_Staging qs
            LEFT JOIN Quotes q ON qs.Quote = q.Quote
            WHERE q.Quote IS NULL
        ');
        write_request_log(200, 'quotes_sync_complete');
        json_response(['success' => true, 'deleted' => $deleted, 'inserted' => $inserted]);
    }

    if ($route === '/upcoming-tests' && $method === 'GET') {
        ensure_upcoming_tests_table($pdo);
        $rows = $pdo->query('SELECT * FROM UpcomingTests ORDER BY `Next Test Due` ASC, `Last Tested On` DESC')->fetchAll();
        $rows = array_map(static function (array $row): array {
            $row['Action Date'] = format_us_date($row['Action Date'] ?? null);
            $row['Last Tested On'] = format_us_date($row['Last Tested On'] ?? null);
            $row['Next Test Due'] = format_us_date($row['Next Test Due'] ?? null);
            $row['Install Date'] = format_us_date($row['Install Date'] ?? null);
            $row['Last Notified At'] = format_us_date($row['Last Notified At'] ?? null);
            return $row;
        }, $rows);
        write_request_log(200, 'upcoming_tests_list');
        json_response($rows);
    }

    if ($route === '/upcoming-tests/update-row' && $method === 'POST') {
        $body = request_json_body();
        $serial = $body['serial'] ?? null;
        $customerAddressLine1 = $body['customerAddressLine1'] ?? null;
        $assemblyLocation = $body['assemblyLocation'] ?? null;

        if ($serial === null || $customerAddressLine1 === null || $assemblyLocation === null) {
            json_response(['error' => 'Serial, Customer Address Line 1, and Assembly Location are required'], 400);
        }

        $existsStmt = $pdo->prepare('
            SELECT 1
            FROM `UpcomingTests`
            WHERE `Serial` = ? AND `Customer Address Line 1` = ? AND `Assembly Location` = ?
            LIMIT 1
        ');
        $existsStmt->execute([$serial, $customerAddressLine1, $assemblyLocation]);
        if (!$existsStmt->fetchColumn()) {
            json_response(['error' => 'Upcoming test row not found'], 404);
        }

        $stmt = $pdo->prepare('
            UPDATE `UpcomingTests`
            SET `Note` = ?, `Action Date` = ?
            WHERE `Serial` = ? AND `Customer Address Line 1` = ? AND `Assembly Location` = ?
        ');
        $stmt->execute([
            $body['note'] ?? '',
            parse_date_or_null($body['actionDate'] ?? null),
            $serial,
            $customerAddressLine1,
            $assemblyLocation,
        ]);
        $updatedStmt = $pdo->prepare('
            SELECT *
            FROM `UpcomingTests`
            WHERE `Serial` = ? AND `Customer Address Line 1` = ? AND `Assembly Location` = ?
            LIMIT 1
        ');
        $updatedStmt->execute([$serial, $customerAddressLine1, $assemblyLocation]);
        $updatedRow = $updatedStmt->fetch() ?: null;
        write_request_log(200, 'upcoming_test_updated');
        json_response([
            'success' => true,
            'rowCount' => $stmt->rowCount(),
            'record' => $updatedRow,
        ]);
    }

    if ($route === '/upcoming-tests/staging' && $method === 'POST') {
        $data = request_json_body();
        ensure_upcoming_tests_staging_table($pdo);
        $pdo->exec('TRUNCATE TABLE UpcomingTests_Staging');

        $stmt = $pdo->prepare('
            INSERT INTO UpcomingTests_Staging (
                `Parent Customer`, `Customer`, `Customer Phone`, `Customer Email`,
                `Customer Address Line 1`, `Customer Address Line 2`, `Customer City`, `Customer State`,
                `Customer Zip`, `Serial`, `Syncta Id`, `Containment`, `Last Tested On`, `Next Test Due`,
                `Assembly Status`, `Assembly Type`, `Assembly Manufacturer`, `Assembly Model`, `Assembly Size`,
                `Assembly Location`, `Install Date`, `Testing Frequency`, `Notification Frequency`,
                `Last Notified At`, `Notification Month`, `Price`, `Test Yearly`, `Water Purveyor`,
                `Service Location Name`, `Service Location Phone`, `Service Location Email`,
                `Service Location Address Line 1`, `Service Location Address Line 2`,
                `Service Location City`, `Service Location State`, `Service Location Zip`
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
        ');

        foreach ($data as $row) {
            if (!is_array($row)) {
                continue;
            }

            $serial = trim((string) ($row['Serial'] ?? ''));
            if ($serial === '') {
                continue;
            }

            $stmt->execute([
                $row['Parent Customer'] ?? '',
                $row['Customer'] ?? '',
                $row['Customer Phone'] ?? '',
                $row['Customer Email'] ?? '',
                $row['Customer Address Line 1'] ?? '',
                $row['Customer Address Line 2'] ?? '',
                $row['Customer City'] ?? '',
                $row['Customer State'] ?? '',
                $row['Customer Zip'] ?? '',
                $serial,
                $row['Syncta Id'] ?? '',
                $row['Containment'] ?? '',
                parse_date_or_null($row['Last Tested On'] ?? null),
                parse_date_or_null($row['Next Test Due'] ?? null),
                $row['Assembly Status'] ?? '',
                $row['Assembly Type'] ?? '',
                $row['Assembly Manufacturer'] ?? '',
                $row['Assembly Model'] ?? '',
                $row['Assembly Size'] ?? '',
                $row['Assembly Location'] ?? '',
                parse_date_or_null($row['Install Date'] ?? null),
                $row['Testing Frequency'] ?? '',
                $row['Notification Frequency'] ?? '',
                parse_date_or_null($row['Last Notified At'] ?? null),
                $row['Notification Month'] ?? '',
                parse_decimal_or_null($row['Price'] ?? null),
                $row['Test Yearly'] ?? '',
                $row['Water Purveyor'] ?? '',
                $row['Service Location Name'] ?? '',
                $row['Service Location Phone'] ?? '',
                $row['Service Location Email'] ?? '',
                $row['Service Location Address Line 1'] ?? '',
                $row['Service Location Address Line 2'] ?? '',
                $row['Service Location City'] ?? '',
                $row['Service Location State'] ?? '',
                $row['Service Location Zip'] ?? '',
            ]);
        }

        write_request_log(200, 'upcoming_tests_staging_loaded');
        json_response(['success' => true]);
    }

    if ($route === '/upcoming-tests/update' && $method === 'POST') {
        ensure_upcoming_tests_table($pdo);

        $deleted = $pdo->exec('
            DELETE FROM UpcomingTests
            WHERE (`Customer Address Line 1`, `Serial`, `Assembly Location`) NOT IN (
                SELECT `Customer Address Line 1`, `Serial`, `Assembly Location`
                FROM UpcomingTests_Staging
            )
        ');

        $updated = $pdo->exec('
            UPDATE UpcomingTests ut
            JOIN UpcomingTests_Staging uts
              ON ut.`Serial` = uts.`Serial`
             AND ut.`Customer Address Line 1` = uts.`Customer Address Line 1`
             AND ut.`Assembly Location` = uts.`Assembly Location`
            SET
              ut.`Parent Customer` = uts.`Parent Customer`,
              ut.`Customer` = uts.`Customer`,
              ut.`Customer Phone` = uts.`Customer Phone`,
              ut.`Customer Email` = uts.`Customer Email`,
              ut.`Customer Address Line 1` = uts.`Customer Address Line 1`,
              ut.`Customer Address Line 2` = uts.`Customer Address Line 2`,
              ut.`Customer City` = uts.`Customer City`,
              ut.`Customer State` = uts.`Customer State`,
              ut.`Customer Zip` = uts.`Customer Zip`,
              ut.`Syncta Id` = uts.`Syncta Id`,
              ut.`Containment` = uts.`Containment`,
              ut.`Last Tested On` = uts.`Last Tested On`,
              ut.`Next Test Due` = uts.`Next Test Due`,
              ut.`Assembly Status` = uts.`Assembly Status`,
              ut.`Assembly Type` = uts.`Assembly Type`,
              ut.`Assembly Manufacturer` = uts.`Assembly Manufacturer`,
              ut.`Assembly Model` = uts.`Assembly Model`,
              ut.`Assembly Size` = uts.`Assembly Size`,
              ut.`Assembly Location` = uts.`Assembly Location`,
              ut.`Install Date` = uts.`Install Date`,
              ut.`Testing Frequency` = uts.`Testing Frequency`,
              ut.`Notification Frequency` = uts.`Notification Frequency`,
              ut.`Last Notified At` = uts.`Last Notified At`,
              ut.`Notification Month` = uts.`Notification Month`,
              ut.`Price` = uts.`Price`,
              ut.`Test Yearly` = uts.`Test Yearly`,
              ut.`Water Purveyor` = uts.`Water Purveyor`,
              ut.`Service Location Name` = uts.`Service Location Name`,
              ut.`Service Location Phone` = uts.`Service Location Phone`,
              ut.`Service Location Email` = uts.`Service Location Email`,
              ut.`Service Location Address Line 1` = uts.`Service Location Address Line 1`,
              ut.`Service Location Address Line 2` = uts.`Service Location Address Line 2`,
              ut.`Service Location City` = uts.`Service Location City`,
              ut.`Service Location State` = uts.`Service Location State`,
              ut.`Service Location Zip` = uts.`Service Location Zip`
        ');

        $inserted = $pdo->exec('
            INSERT INTO UpcomingTests (
                `Parent Customer`, `Customer`, `Note`, `Action Date`, `Customer Phone`, `Customer Email`,
                `Customer Address Line 1`, `Customer Address Line 2`, `Customer City`, `Customer State`,
                `Customer Zip`, `Serial`, `Syncta Id`, `Containment`, `Last Tested On`, `Next Test Due`,
                `Assembly Status`, `Assembly Type`, `Assembly Manufacturer`, `Assembly Model`, `Assembly Size`,
                `Assembly Location`, `Install Date`, `Testing Frequency`, `Notification Frequency`,
                `Last Notified At`, `Notification Month`, `Price`, `Test Yearly`, `Water Purveyor`,
                `Service Location Name`, `Service Location Phone`, `Service Location Email`,
                `Service Location Address Line 1`, `Service Location Address Line 2`,
                `Service Location City`, `Service Location State`, `Service Location Zip`
            )
            SELECT
                uts.`Parent Customer`, uts.`Customer`, "" AS `Note`, NULL AS `Action Date`, uts.`Customer Phone`, uts.`Customer Email`,
                uts.`Customer Address Line 1`, uts.`Customer Address Line 2`, uts.`Customer City`, uts.`Customer State`,
                uts.`Customer Zip`, uts.`Serial`, uts.`Syncta Id`, uts.`Containment`, uts.`Last Tested On`, uts.`Next Test Due`,
                uts.`Assembly Status`, uts.`Assembly Type`, uts.`Assembly Manufacturer`, uts.`Assembly Model`, uts.`Assembly Size`,
                uts.`Assembly Location`, uts.`Install Date`, uts.`Testing Frequency`, uts.`Notification Frequency`,
                uts.`Last Notified At`, uts.`Notification Month`, uts.`Price`, uts.`Test Yearly`, uts.`Water Purveyor`,
                uts.`Service Location Name`, uts.`Service Location Phone`, uts.`Service Location Email`,
                uts.`Service Location Address Line 1`, uts.`Service Location Address Line 2`,
                uts.`Service Location City`, uts.`Service Location State`, uts.`Service Location Zip`
            FROM UpcomingTests_Staging uts
            LEFT JOIN UpcomingTests ut
              ON uts.`Serial` = ut.`Serial`
             AND uts.`Customer Address Line 1` = ut.`Customer Address Line 1`
             AND uts.`Assembly Location` = ut.`Assembly Location`
            WHERE ut.`Serial` IS NULL
        ');

        json_response([
            'success' => true,
            'deleted' => $deleted,
            'updated' => $updated,
            'inserted' => $inserted,
        ]);
    }

    write_request_log(404, 'route_not_found');
    json_response(['error' => 'Not found'], 404);
} catch (InvalidArgumentException $e) {
    write_request_log(400, 'invalid_request');
    json_response(['error' => $e->getMessage()], 400);
} catch (Throwable $e) {
    write_request_log(500, 'server_error');
    json_response([
        'error' => 'Server error',
        'details' => $e->getMessage(),
    ], 500);
}
