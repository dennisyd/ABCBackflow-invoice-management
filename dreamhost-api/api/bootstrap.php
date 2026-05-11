<?php

declare(strict_types=1);

function api_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $configFile = __DIR__ . '/config.php';
    if (!file_exists($configFile)) {
        throw new RuntimeException('Missing config.php. Copy config.example.php to config.php first.');
    }

    $config = require $configFile;
    if (!is_array($config)) {
        throw new RuntimeException('config.php must return an array.');
    }

    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = api_config()['db'] ?? [];
    $charset = $db['charset'] ?? 'utf8mb4';
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'] ?? '',
        (int) ($db['port'] ?? 3306),
        $db['name'] ?? '',
        $charset
    );

    $pdo = new PDO($dsn, $db['user'] ?? '', $db['password'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function send_cors_headers(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = api_config()['cors']['allowed_origins'] ?? [];

    if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
        header("Access-Control-Allow-Origin: {$origin}");
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-API-Token');
}

function maybe_handle_preflight(): void
{
    enforce_origin_policy();
    send_cors_headers();
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function enforce_origin_policy(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = api_config()['cors']['allowed_origins'] ?? [];

    if ($origin !== '' && !in_array($origin, $allowedOrigins, true)) {
        write_request_log(403, 'blocked_origin');
        json_response(['error' => 'Origin not allowed'], 403);
    }
}

function json_response($data, int $status = 200): void
{
    send_cors_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo json_encode($data);
    exit;
}

function csv_response(string $filename, array $rows): void
{
    send_cors_headers();
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');

    $out = fopen('php://output', 'wb');
    if ($out === false) {
        throw new RuntimeException('Failed to open CSV output stream.');
    }

    if (!empty($rows)) {
        fputcsv($out, array_keys($rows[0]));
        foreach ($rows as $row) {
            fputcsv($out, array_values($row));
        }
    }

    fclose($out);
    exit;
}

function request_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new InvalidArgumentException('Invalid JSON request body.');
    }

    return $data;
}

function configured_api_token(): string
{
    return (string) (api_config()['security']['api_token'] ?? '');
}

function require_api_token(): void
{
    $configured = configured_api_token();
    if ($configured === '') {
        throw new RuntimeException('Missing security.api_token in config.php.');
    }

    $provided = $_SERVER['HTTP_X_API_TOKEN'] ?? '';
    if (!is_string($provided) || $provided === '' || !hash_equals($configured, $provided)) {
        write_request_log(401, 'invalid_token');
        json_response(['error' => 'Unauthorized'], 401);
    }
}

function request_client_ip(): string
{
    $forwardedFor = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($forwardedFor !== '') {
        $parts = explode(',', $forwardedFor);
        return trim($parts[0]);
    }

    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

function request_user_agent(): string
{
    return substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 0, 255);
}

function request_log_file(): string
{
    $configured = (string) (api_config()['security']['log_file'] ?? '');
    if ($configured !== '') {
        return $configured;
    }

    return __DIR__ . '/../logs/api.log';
}

function ensure_log_directory_exists(string $file): void
{
    $directory = dirname($file);
    if (!is_dir($directory)) {
        mkdir($directory, 0775, true);
    }
}

function write_request_log(int $statusCode, string $message = ''): void
{
    $file = request_log_file();
    ensure_log_directory_exists($file);

    $line = sprintf(
        "[%s] %s %s %s %d %s %s\n",
        (new DateTimeImmutable('now'))->format('Y-m-d H:i:s'),
        request_client_ip(),
        $_SERVER['REQUEST_METHOD'] ?? 'GET',
        get_route_path(),
        $statusCode,
        request_user_agent(),
        $message
    );

    error_log($line, 3, $file);
}

function format_us_date($value): string
{
    if ($value === null || $value === '') {
        return '';
    }

    $v = trim((string) $value);
    if ($v === '') {
        return '';
    }

    // Try explicit formats so 2-digit years are handled predictably.
    // PHP's createFromFormat with 'y' expands 00-69 → 2000-2069, 70-99 → 1970-1999.
    $formats = [
        'n/j/Y',  // 3/18/2026
        'm/d/Y',  // 03/18/2026
        'n/j/y',  // 3/18/26
        'm/d/y',  // 03/18/26
        'n-j-Y',  // 3-18-2026
        'm-d-Y',  // 03-18-2026
        'n-j-y',  // 3-18-26
        'm-d-y',  // 03-18-26
        'Y-m-d',  // 2026-03-18 (ISO)
    ];

    foreach ($formats as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $v);
        if ($dt instanceof DateTime) {
            // Skip if the year is implausibly small — means a 2-digit year was
            // fed into a 4-digit format (e.g. "26" parsed as year 26 AD).
            if ((int) $dt->format('Y') < 100) {
                continue;
            }
            return $dt->format('n/j/Y');
        }
    }

    // Last-resort fallback using PHP's generic parser
    try {
        return (new DateTime($v))->format('n/j/Y');
    } catch (Throwable $e) {
        return '';
    }
}

function parse_date_or_null($value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    $normalized = trim((string) $value);
    $formats = ['Y-m-d', 'n/j/Y', 'm/d/Y', 'n-j-Y', 'm-d-Y', DateTimeInterface::ATOM];

    foreach ($formats as $format) {
        $dt = DateTime::createFromFormat($format, $normalized);
        if ($dt instanceof DateTime) {
            return $dt->format('Y-m-d');
        }
    }

    try {
        return (new DateTime($normalized))->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function parse_decimal_or_null($value): ?float
{
    if ($value === null || $value === '') {
        return null;
    }

    $normalized = preg_replace('/[^0-9.\-]/', '', (string) $value);
    if ($normalized === '' || $normalized === '-' || $normalized === '.') {
        return null;
    }

    return is_numeric($normalized) ? (float) $normalized : null;
}

function current_download_date(): string
{
    return (new DateTime('now'))->format('m-d-Y');
}

function get_route_path(): string
{
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($requestUri, PHP_URL_PATH) ?? '/';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';

    if ($scriptName !== '' && str_starts_with($path, dirname($scriptName))) {
        $path = substr($path, strlen(dirname($scriptName)));
    }

    $path = '/' . ltrim((string) $path, '/');
    if ($path === '/index.php') {
        return '/';
    }

    return preg_replace('#/+#', '/', $path) ?: '/';
}

function ensure_upcoming_tests_primary_key(PDO $pdo): void
{
    $pdo->exec("UPDATE UpcomingTests SET `Customer Address Line 1` = '' WHERE `Customer Address Line 1` IS NULL");
    $pdo->exec("UPDATE UpcomingTests SET `Assembly Location` = '' WHERE `Assembly Location` IS NULL");

    $sql = "
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'UpcomingTests'
          AND CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY ORDINAL_POSITION
    ";
    $currentPk = $pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN) ?: [];
    $desiredPk = ['Customer Address Line 1', 'Serial', 'Assembly Location'];

    if ($currentPk !== $desiredPk) {
        if (!empty($currentPk)) {
            $pdo->exec('ALTER TABLE UpcomingTests DROP PRIMARY KEY');
        }
        $pdo->exec('ALTER TABLE UpcomingTests ADD PRIMARY KEY (`Customer Address Line 1`, `Serial`, `Assembly Location`)');
    }
}

function ensure_upcoming_tests_table(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS UpcomingTests (
            `Parent Customer` VARCHAR(255),
            `Customer` VARCHAR(255),
            `Note` TEXT,
            `Action Date` DATE,
            `Customer Phone` VARCHAR(255),
            `Customer Email` VARCHAR(255),
            `Customer Address Line 1` VARCHAR(255),
            `Customer Address Line 2` VARCHAR(255),
            `Customer City` VARCHAR(255),
            `Customer State` VARCHAR(255),
            `Customer Zip` VARCHAR(50),
            `Serial` VARCHAR(255),
            `Syncta Id` VARCHAR(255),
            `Containment` VARCHAR(255),
            `Last Tested On` DATE,
            `Next Test Due` DATE,
            `Assembly Status` VARCHAR(255),
            `Assembly Type` VARCHAR(255),
            `Assembly Manufacturer` VARCHAR(255),
            `Assembly Model` VARCHAR(255),
            `Assembly Size` VARCHAR(255),
            `Assembly Location` VARCHAR(255),
            `Install Date` DATE,
            `Testing Frequency` VARCHAR(255),
            `Notification Frequency` VARCHAR(255),
            `Last Notified At` DATE,
            `Notification Month` VARCHAR(255),
            `Price` DECIMAL(10,2),
            `Test Yearly` VARCHAR(255),
            `Water Purveyor` VARCHAR(255),
            `Service Location Name` VARCHAR(255),
            `Service Location Phone` VARCHAR(255),
            `Service Location Email` VARCHAR(255),
            `Service Location Address Line 1` VARCHAR(255),
            `Service Location Address Line 2` VARCHAR(255),
            `Service Location City` VARCHAR(255),
            `Service Location State` VARCHAR(255),
            `Service Location Zip` VARCHAR(50)
        )
    ");

    try {
        $pdo->exec('ALTER TABLE UpcomingTests ADD COLUMN `Action Date` DATE AFTER `Note`');
    } catch (Throwable $e) {
    }

    ensure_upcoming_tests_primary_key($pdo);
}

function ensure_upcoming_tests_staging_table(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS UpcomingTests_Staging (
            `Parent Customer` VARCHAR(255),
            `Customer` VARCHAR(255),
            `Customer Phone` VARCHAR(255),
            `Customer Email` VARCHAR(255),
            `Customer Address Line 1` VARCHAR(255),
            `Customer Address Line 2` VARCHAR(255),
            `Customer City` VARCHAR(255),
            `Customer State` VARCHAR(255),
            `Customer Zip` VARCHAR(50),
            `Serial` VARCHAR(255),
            `Syncta Id` VARCHAR(255),
            `Containment` VARCHAR(255),
            `Last Tested On` DATE,
            `Next Test Due` DATE,
            `Assembly Status` VARCHAR(255),
            `Assembly Type` VARCHAR(255),
            `Assembly Manufacturer` VARCHAR(255),
            `Assembly Model` VARCHAR(255),
            `Assembly Size` VARCHAR(255),
            `Assembly Location` VARCHAR(255),
            `Install Date` DATE,
            `Testing Frequency` VARCHAR(255),
            `Notification Frequency` VARCHAR(255),
            `Last Notified At` DATE,
            `Notification Month` VARCHAR(255),
            `Price` DECIMAL(10,2),
            `Test Yearly` VARCHAR(255),
            `Water Purveyor` VARCHAR(255),
            `Service Location Name` VARCHAR(255),
            `Service Location Phone` VARCHAR(255),
            `Service Location Email` VARCHAR(255),
            `Service Location Address Line 1` VARCHAR(255),
            `Service Location Address Line 2` VARCHAR(255),
            `Service Location City` VARCHAR(255),
            `Service Location State` VARCHAR(255),
            `Service Location Zip` VARCHAR(50)
        )
    ");

    try {
        $pdo->exec('ALTER TABLE UpcomingTests_Staging DROP COLUMN `Note`');
    } catch (Throwable $e) {
    }
}
