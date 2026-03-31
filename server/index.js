require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pool = require('./config/db');
const fs = require('fs');
const xlsx = require('xlsx');

const app = express();
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '25mb';

app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));

const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d) ? null : d;
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? null : num;
};

const ensureUpcomingTestsPrimaryKey = async (connection) => {
  await connection.execute(`
    UPDATE UpcomingTests
    SET \`Customer Address Line 1\` = ''
    WHERE \`Customer Address Line 1\` IS NULL
  `);
  await connection.execute(`
    UPDATE UpcomingTests
    SET \`Assembly Location\` = ''
    WHERE \`Assembly Location\` IS NULL
  `);

  const [pkRows] = await connection.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'UpcomingTests'
      AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY ORDINAL_POSITION
  `);

  const currentPk = pkRows.map((row) => row.COLUMN_NAME);
  const desiredPk = ['Customer Address Line 1', 'Serial', 'Assembly Location'];
  const matchesDesiredPk =
    currentPk.length === desiredPk.length &&
    currentPk.every((column, index) => column === desiredPk[index]);

  if (!matchesDesiredPk) {
    if (currentPk.length > 0) {
      await connection.execute('ALTER TABLE UpcomingTests DROP PRIMARY KEY');
    }
    await connection.execute(`
      ALTER TABLE UpcomingTests
      ADD PRIMARY KEY (\`Customer Address Line 1\`, \`Serial\`, \`Assembly Location\`)
    `);
  }
};

// Debug: Log essential environment variables
console.log('Environment variables loaded:', {
  host: process.env.DB_HOST || 'not set',
  user: process.env.DB_USER || 'not set',
  database: process.env.DB_NAME || 'not set',
  port: process.env.DB_PORT || 'not set',
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// Ensure the 'uploads' directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Endpoint: Fetch invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to database for /api/invoices');

    const sql = "SELECT * FROM ABC_Invoices ORDER BY STR_TO_DATE(`Due Date`, '%m/%d/%Y') DESC";
    const [rows] = await connection.execute(sql);
    console.log(`Fetched ${rows.length} rows from database`);

    connection.release();

    // Format dates for consistency
    const formattedRows = rows.map(row => ({
      ...row,
      'Due Date': row['Due Date'] ? new Date(row['Due Date']).toLocaleDateString('en-US') : '',
      'Action Date': row['Action Date'] ? new Date(row['Action Date']).toLocaleDateString('en-US') : '',
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error in /api/invoices:', error);
    res.status(500).json({ error: 'Error fetching invoices', details: error.message });
  }
});

// Endpoint: Update an invoice
app.post('/api/invoices/update', async (req, res) => {
  const { invoiceId, note, actionDate } = req.body;

  try {
    const connection = await pool.getConnection();
    await connection.execute(
      'UPDATE `ABC_Invoices` SET `Note` = ?, `Action Date` = ? WHERE `Invoice` = ?',
      [note, actionDate, invoiceId]
    );
    connection.release();
    res.json({ success: true, message: 'Invoice updated successfully' });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Error updating invoice' });
  }
});

// Endpoint: Download invoices as CSV
app.get('/api/invoices/download', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const sql = "SELECT * FROM ABC_Invoices ORDER BY STR_TO_DATE(`Due Date`, '%m/%d/%Y') DESC";
    const [rows] = await connection.execute(sql);
    connection.release();

    // Prepare CSV content
    const headers = Object.keys(rows[0]).join(',') + '\n';
    const csvRows = rows.map(row =>
      Object.values(row)
        .map(value => `"${String(value).replace(/"/g, '""')}"`)
        .join(',')
    ).join('\n');
    const csvContent = headers + csvRows;

    // Set response headers for download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=invoices_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ error: 'Error generating CSV' });
  }
});

app.post('/api/past-due/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Uploading file:', req.file.originalname);

    const workbook = xlsx.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    let data = xlsx.utils.sheet_to_json(worksheet);

    console.log('Parsed data sample:', data.slice(0, 2));

    data = data.map(row => ({
      ...row,
      Note: row.Note || '',
      'Action Date': row['Action Date'] || '',
    }));

    const connection = await pool.getConnection();

    // Truncate staging table
    await connection.execute('TRUNCATE TABLE Staging');
    console.log('Staging table truncated');

    // Insert data into staging
    for (const row of data) {
      await connection.execute(
        `INSERT INTO Staging (Invoice, \`Due Date\`, Note, \`Action Date\`, \`Customer Name\`, \`Service Location\`) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          row.Invoice || row['#'],
          row['Due Date'],
          row.Note,
          row['Action Date'],
          row['Customer Name'],
          row['Service Location'],
        ]
      );
    }
    console.log(`Inserted ${data.length} records into Staging`);

    // Sync with ABC_Invoices table
    await connection.execute(`
      DELETE FROM ABC_Invoices 
      WHERE Invoice NOT IN (SELECT Invoice FROM Staging)
    `);
    console.log('Deleted obsolete invoices from ABC_Invoices');

    await connection.execute(`
      INSERT INTO ABC_Invoices 
      SELECT * FROM Staging 
      WHERE Invoice NOT IN (SELECT Invoice FROM ABC_Invoices)
    `);
    console.log('Inserted new invoices from Staging into ABC_Invoices');

    connection.release();

    // Clean up file
    fs.unlinkSync(req.file.path);

    res.json({
      message: 'File processed successfully',
      data: data,
    });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error processing file: ' + error.message });
  }
});

app.post('/api/past-due/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.log('No file received');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File received:', {
      filename: req.file.originalname,
      path: req.file.path,
      mimetype: req.file.mimetype,
    });

    // Ensure uploads directory exists
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads');
    }

    // Attempt to read the file using xlsx
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error('No worksheet found in the uploaded file');
    }

    // Convert to JSON
    let data = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      dateNF: 'mm-dd-yyyy',
    });

    // Log a preview of the data
    console.log('Preview of parsed data:', data.slice(0, 2));

    // Clean up the temporary file
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupError) {
      console.error('Error cleaning up file:', cleanupError);
    }

    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (error) {
    console.error('Error processing Excel file:', {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: 'Error processing file',
      details: error.message,
    });
  }
});

// Add to server/index.js
app.post('/api/past-due/staging', async (req, res) => {
  try {
    const data = req.body;
    const connection = await pool.getConnection();

    // First, try to create the Staging table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Staging (
        \`Invoice\` VARCHAR(255),
        \`Due Date\` DATE,
        \`Note\` TEXT,
        \`Action Date\` DATE,
        \`Customer Name\` VARCHAR(255),
        \`Service Location\` VARCHAR(255),
        \`Rows\` VARCHAR(255),
        \`Customer Email\` VARCHAR(255),
        \`PO Number\` VARCHAR(255),
        \`Phone 1\` VARCHAR(255),
        \`Phone 2\` VARCHAR(255),
        \`Total Amount\` DECIMAL(10,2),
        \`Customer Address\` TEXT,
        \`Service Location Contact\` VARCHAR(255),
        \`Service Location Phone\` VARCHAR(255),
        \`Parent Customer Name\` VARCHAR(255),
        \`Parent Customer Phone\` VARCHAR(255),
        \`Parent Customer Address\` TEXT
      )
    `);

    // Clear existing data from staging
    await connection.execute('TRUNCATE TABLE Staging');

    // Insert new data into staging
    for (const row of data) {
      await connection.execute(`
        INSERT INTO Staging (
          \`Invoice\`, \`Due Date\`, \`Note\`, \`Action Date\`, \`Customer Name\`, \`Service Location\`
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        row.Invoice || row['#'], 
        row['Due Date'] ? new Date(row['Due Date']) : null,
        row.Note || '',
        row['Action Date'] ? new Date(row['Action Date']) : null,
        row['Customer Name'] || '',
        row['Service Location'] || ''
      ]);
    }

    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating staging:', error);
    res.status(500).json({ error: 'Failed to update staging table' });
  }
});

app.post('/api/past-due/update', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Delete records not in staging
    await connection.execute(`
      DELETE FROM ABC_Invoices 
      WHERE Invoice NOT IN (SELECT Invoice FROM Staging)
    `);

    // Insert new records from staging
    await connection.execute(`
      INSERT INTO ABC_Invoices 
      SELECT * FROM Staging 
      WHERE Invoice NOT IN (SELECT Invoice FROM ABC_Invoices)
    `);

    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating database:', error);
    res.status(500).json({ error: 'Failed to update database' });
  }
});

// Add these endpoints to your server/index.js

// Fetch all quotes
app.get('/api/quotes', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    console.log('Connected to database in /api/quotes endpoint');
    
    const [rows] = await connection.execute('SELECT * FROM `Quotes` ORDER BY `Quote` DESC');
    console.log('Fetched quotes count:', rows.length);
    
    connection.release();
    
    // Transform dates to match your format
    const formattedRows = rows.map(row => ({
      ...row,
      'Action Date': row['Action Date'] ? new Date(row['Action Date']).toLocaleDateString('en-US') : ''
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Detailed error in /api/quotes:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({ error: 'Error fetching quotes', details: error.message });
  }
});

// Update quote
app.post('/api/quotes/update', async (req, res) => {
  try {
    const { quoteId, note, actionDate } = req.body;
    const connection = await pool.getConnection();
    
    await connection.execute(
      'UPDATE `Quotes` SET `Note` = ?, `Action Date` = ? WHERE `Quote` = ?',
      [note, actionDate, quoteId]
    );
    
    connection.release();
    res.json({ success: true, message: 'Quote updated successfully' });
  } catch (error) {
    console.error('Error updating quote:', error);
    res.status(500).json({ error: 'Error updating quote' });
  }
});

// Download quotes
app.get('/api/quotes/download', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute('SELECT * FROM Quotes ORDER BY `Quote` DESC');
    connection.release();

    // Convert rows to CSV
    const headers = Object.keys(rows[0]).join(',') + '\n';
    const csvRows = rows.map(row => 
      Object.values(row).map(value => 
        `"${String(value).replace(/"/g, '""')}"`
      ).join(',')
    ).join('\n');
    
    const csv = headers + csvRows;

    // Set response headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=quotes_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);

    // Send CSV
    res.send(csv);

  } catch (error) {
    console.error('Error downloading quotes:', error);
    res.status(500).json({ error: 'Error downloading quotes' });
  }
});

app.post('/api/quotes/staging', async (req, res) => {
  try {
    const data = req.body;
    const connection = await pool.getConnection();

    // Create Quotes_Staging table 
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS Quotes_Staging (
        \`Quote\` VARCHAR(255),
        \`Name\` VARCHAR(255),
        \`Note\` TEXT,
        \`Action Date\` DATE,
        \`Total Amount\` DECIMAL(10,2)
      )
    `);

    // Step 1: Load to staging (matching your load_df_to_staging function)
    await connection.execute('TRUNCATE TABLE Quotes_Staging');

    // Insert into staging
    for (const row of data) {
      await connection.execute(`
        INSERT INTO Quotes_Staging (
          \`Quote\`, \`Name\`, \`Note\`, \`Action Date\`, \`Total Amount\`
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        row.Quote,
        row.Name,
        row.Note || '',
        row['Action Date'] ? new Date(row['Action Date']) : null,
        row['Total Amount'] || row.Amount || 0
      ]);
    }

    connection.release();
    res.json({ success: true });

  } catch (error) {
    console.error('Error updating quotes staging:', error);
    res.status(500).json({ error: 'Failed to update staging table' });
  }
});

app.post('/api/quotes/update-from-staging', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Step 2: Only delete quotes not in staging (matching delete_quotes_not_in_staging)
    const [deleteResult] = await connection.execute(`
      DELETE FROM Quotes 
      WHERE Quote NOT IN (SELECT Quote FROM Quotes_Staging)
    `);
    console.log(`Deleted ${deleteResult.affectedRows} quotes not in staging`);

    // Step 3: Only insert quotes that don't exist yet (matching insert_new_quotes)
    const [insertResult] = await connection.execute(`
      INSERT INTO Quotes (\`Quote\`, \`Name\`, \`Note\`, \`Action Date\`, \`Total Amount\`)
      SELECT qs.\`Quote\`, qs.\`Name\`, qs.\`Note\`, qs.\`Action Date\`, qs.\`Total Amount\`
      FROM Quotes_Staging qs
      LEFT JOIN Quotes q ON qs.Quote = q.Quote
      WHERE q.Quote IS NULL
    `);
    console.log(`Inserted ${insertResult.affectedRows} new quotes`);

    connection.release();
    res.json({ success: true });

  } catch (error) {
    console.error('Error updating from staging:', error);
    res.status(500).json({ error: 'Failed to update from staging' });
  }
});

// Upcoming Tests endpoints
app.get('/api/upcoming-tests', async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS UpcomingTests (
        \`Parent Customer\` VARCHAR(255),
        \`Customer\` VARCHAR(255),
        \`Note\` TEXT,
        \`Action Date\` DATE,
        \`Customer Phone\` VARCHAR(255),
        \`Customer Email\` VARCHAR(255),
        \`Customer Address Line 1\` VARCHAR(255),
        \`Customer Address Line 2\` VARCHAR(255),
        \`Customer City\` VARCHAR(255),
        \`Customer State\` VARCHAR(255),
        \`Customer Zip\` VARCHAR(50),
        \`Serial\` VARCHAR(255),
        \`Syncta Id\` VARCHAR(255),
        \`Containment\` VARCHAR(255),
        \`Last Tested On\` DATE,
        \`Next Test Due\` DATE,
        \`Assembly Status\` VARCHAR(255),
        \`Assembly Type\` VARCHAR(255),
        \`Assembly Manufacturer\` VARCHAR(255),
        \`Assembly Model\` VARCHAR(255),
        \`Assembly Size\` VARCHAR(255),
        \`Assembly Location\` VARCHAR(255),
        \`Install Date\` DATE,
        \`Testing Frequency\` VARCHAR(255),
        \`Notification Frequency\` VARCHAR(255),
        \`Last Notified At\` DATE,
        \`Notification Month\` VARCHAR(255),
        \`Price\` DECIMAL(10,2),
        \`Test Yearly\` VARCHAR(255),
        \`Water Purveyor\` VARCHAR(255),
        \`Service Location Name\` VARCHAR(255),
        \`Service Location Phone\` VARCHAR(255),
        \`Service Location Email\` VARCHAR(255),
        \`Service Location Address Line 1\` VARCHAR(255),
        \`Service Location Address Line 2\` VARCHAR(255),
        \`Service Location City\` VARCHAR(255),
        \`Service Location State\` VARCHAR(255),
        \`Service Location Zip\` VARCHAR(50)
      )
    `);
    try {
      await connection.execute('ALTER TABLE UpcomingTests ADD COLUMN `Action Date` DATE AFTER `Note`');
    } catch (alterErr) {
      const code = alterErr?.code;
      if (code !== 'ER_DUP_FIELDNAME') {
        throw alterErr;
      }
    }
    await ensureUpcomingTestsPrimaryKey(connection);
    try {
      await connection.execute('ALTER TABLE UpcomingTests ADD COLUMN `Action Date` DATE AFTER `Note`');
    } catch (alterErr) {
      const code = alterErr?.code;
      if (code !== 'ER_DUP_FIELDNAME') {
        throw alterErr;
      }
    }

    const [rows] = await connection.execute(
      'SELECT * FROM UpcomingTests ORDER BY `Next Test Due` ASC, `Last Tested On` DESC'
    );

    const formattedRows = rows.map(row => ({
      ...row,
      'Action Date': row['Action Date'] ? new Date(row['Action Date']).toLocaleDateString('en-US') : '',
      'Last Tested On': row['Last Tested On'] ? new Date(row['Last Tested On']).toLocaleDateString('en-US') : '',
      'Next Test Due': row['Next Test Due'] ? new Date(row['Next Test Due']).toLocaleDateString('en-US') : '',
      'Install Date': row['Install Date'] ? new Date(row['Install Date']).toLocaleDateString('en-US') : '',
      'Last Notified At': row['Last Notified At'] ? new Date(row['Last Notified At']).toLocaleDateString('en-US') : '',
    }));

    res.json(formattedRows);
  } catch (error) {
    console.error('Error fetching upcoming tests:', error);
    res.status(500).json({ error: 'Error fetching upcoming tests', details: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// Update a single Upcoming Test's Note and Action Date by composite key
app.post('/api/upcoming-tests/update-row', async (req, res) => {
  const { serial, customerAddressLine1, assemblyLocation, note, actionDate } = req.body || {};
  if (!serial || customerAddressLine1 === undefined || customerAddressLine1 === null || assemblyLocation === undefined || assemblyLocation === null) {
    return res.status(400).json({ error: 'Serial, Customer Address Line 1, and Assembly Location are required' });
  }

  try {
    const connection = await pool.getConnection();
    await connection.execute(
      'UPDATE `UpcomingTests` SET `Note` = ?, `Action Date` = ? WHERE `Serial` = ? AND `Customer Address Line 1` = ? AND `Assembly Location` = ?',
      [note || '', actionDate ? new Date(actionDate) : null, serial, customerAddressLine1, assemblyLocation]
    );
    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating upcoming test row:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage,
    });
    res.status(500).json({ error: 'Failed to update upcoming test row', details: error.message });
  }
});

app.post('/api/upcoming-tests/staging', async (req, res) => {
  try {
    const data = req.body;
    console.log(`[upcoming-tests/staging] received ${data?.length || 0} rows`);
    const connection = await pool.getConnection();

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS UpcomingTests_Staging (
        \`Parent Customer\` VARCHAR(255),
        \`Customer\` VARCHAR(255),
        \`Customer Phone\` VARCHAR(255),
        \`Customer Email\` VARCHAR(255),
        \`Customer Address Line 1\` VARCHAR(255),
        \`Customer Address Line 2\` VARCHAR(255),
        \`Customer City\` VARCHAR(255),
        \`Customer State\` VARCHAR(255),
        \`Customer Zip\` VARCHAR(50),
        \`Serial\` VARCHAR(255),
        \`Syncta Id\` VARCHAR(255),
        \`Containment\` VARCHAR(255),
        \`Last Tested On\` DATE,
        \`Next Test Due\` DATE,
        \`Assembly Status\` VARCHAR(255),
        \`Assembly Type\` VARCHAR(255),
        \`Assembly Manufacturer\` VARCHAR(255),
        \`Assembly Model\` VARCHAR(255),
        \`Assembly Size\` VARCHAR(255),
        \`Assembly Location\` VARCHAR(255),
        \`Install Date\` DATE,
        \`Testing Frequency\` VARCHAR(255),
        \`Notification Frequency\` VARCHAR(255),
        \`Last Notified At\` DATE,
        \`Notification Month\` VARCHAR(255),
        \`Price\` DECIMAL(10,2),
        \`Test Yearly\` VARCHAR(255),
        \`Water Purveyor\` VARCHAR(255),
        \`Service Location Name\` VARCHAR(255),
        \`Service Location Phone\` VARCHAR(255),
        \`Service Location Email\` VARCHAR(255),
        \`Service Location Address Line 1\` VARCHAR(255),
        \`Service Location Address Line 2\` VARCHAR(255),
        \`Service Location City\` VARCHAR(255),
        \`Service Location State\` VARCHAR(255),
        \`Service Location Zip\` VARCHAR(50)
      )
    `);

    // Ensure staging schema does not carry a Note column (Notes are only tracked in the main table)
    try {
      await connection.execute('ALTER TABLE UpcomingTests_Staging DROP COLUMN `Note`');
    } catch (dropErr) {
      // Older MySQL versions may error if the column doesn't exist; ignore those cases
      const code = dropErr?.code;
      if (code !== 'ER_CANT_DROP_FIELD_OR_KEY' && code !== 'ER_BAD_FIELD_ERROR') {
        throw dropErr;
      }
    }

    await connection.execute('TRUNCATE TABLE UpcomingTests_Staging');

    for (const row of data) {
      const serial = (row['Serial'] || '').toString().trim();
      // Skip rows without a Serial to avoid PK conflicts during sync
      if (!serial) {
        continue;
      }

      await connection.execute(
        `INSERT INTO UpcomingTests_Staging (
          \`Parent Customer\`, \`Customer\`, \`Customer Phone\`, \`Customer Email\`,
          \`Customer Address Line 1\`, \`Customer Address Line 2\`, \`Customer City\`, \`Customer State\`,
          \`Customer Zip\`, \`Serial\`, \`Syncta Id\`, \`Containment\`, \`Last Tested On\`, \`Next Test Due\`,
          \`Assembly Status\`, \`Assembly Type\`, \`Assembly Manufacturer\`, \`Assembly Model\`, \`Assembly Size\`,
          \`Assembly Location\`, \`Install Date\`, \`Testing Frequency\`, \`Notification Frequency\`,
          \`Last Notified At\`, \`Notification Month\`, \`Price\`, \`Test Yearly\`, \`Water Purveyor\`,
          \`Service Location Name\`, \`Service Location Phone\`, \`Service Location Email\`,
          \`Service Location Address Line 1\`, \`Service Location Address Line 2\`,
          \`Service Location City\`, \`Service Location State\`, \`Service Location Zip\`
        ) VALUES (${Array(36).fill('?').join(', ')})`,
        [
          row['Parent Customer'] || '',
          row['Customer'] || '',
          row['Customer Phone'] || '',
          row['Customer Email'] || '',
          row['Customer Address Line 1'] || '',
          row['Customer Address Line 2'] || '',
          row['Customer City'] || '',
          row['Customer State'] || '',
          row['Customer Zip'] || '',
          serial,
          row['Syncta Id'] || '',
          row['Containment'] || '',
          parseDate(row['Last Tested On']),
          parseDate(row['Next Test Due']),
          row['Assembly Status'] || '',
          row['Assembly Type'] || '',
          row['Assembly Manufacturer'] || '',
          row['Assembly Model'] || '',
          row['Assembly Size'] || '',
          row['Assembly Location'] || '',
          parseDate(row['Install Date']),
          row['Testing Frequency'] || '',
          row['Notification Frequency'] || '',
          parseDate(row['Last Notified At']),
          row['Notification Month'] || '',
          parseNumber(row['Price']),
          row['Test Yearly'] || '',
          row['Water Purveyor'] || '',
          row['Service Location Name'] || '',
          row['Service Location Phone'] || '',
          row['Service Location Email'] || '',
          row['Service Location Address Line 1'] || '',
          row['Service Location Address Line 2'] || '',
          row['Service Location City'] || '',
          row['Service Location State'] || '',
          row['Service Location Zip'] || '',
        ]
      );
    }

    console.log('[upcoming-tests/staging] staging load complete');
    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating upcoming tests staging:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      sql: error.sql,
    });
    res.status(500).json({
      error: 'Failed to update upcoming tests staging',
      details: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sqlState: error.sqlState,
      sql: error.sql,
    });
  }
});

app.post('/api/upcoming-tests/update', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS UpcomingTests (
        \`Parent Customer\` VARCHAR(255),
        \`Customer\` VARCHAR(255),
        \`Note\` TEXT,
        \`Action Date\` DATE,
        \`Customer Phone\` VARCHAR(255),
        \`Customer Email\` VARCHAR(255),
        \`Customer Address Line 1\` VARCHAR(255),
        \`Customer Address Line 2\` VARCHAR(255),
        \`Customer City\` VARCHAR(255),
        \`Customer State\` VARCHAR(255),
        \`Customer Zip\` VARCHAR(50),
        \`Serial\` VARCHAR(255),
        \`Syncta Id\` VARCHAR(255),
        \`Containment\` VARCHAR(255),
        \`Last Tested On\` DATE,
        \`Next Test Due\` DATE,
        \`Assembly Status\` VARCHAR(255),
        \`Assembly Type\` VARCHAR(255),
        \`Assembly Manufacturer\` VARCHAR(255),
        \`Assembly Model\` VARCHAR(255),
        \`Assembly Size\` VARCHAR(255),
        \`Assembly Location\` VARCHAR(255),
        \`Install Date\` DATE,
        \`Testing Frequency\` VARCHAR(255),
        \`Notification Frequency\` VARCHAR(255),
        \`Last Notified At\` DATE,
        \`Notification Month\` VARCHAR(255),
        \`Price\` DECIMAL(10,2),
        \`Test Yearly\` VARCHAR(255),
        \`Water Purveyor\` VARCHAR(255),
        \`Service Location Name\` VARCHAR(255),
        \`Service Location Phone\` VARCHAR(255),
        \`Service Location Email\` VARCHAR(255),
        \`Service Location Address Line 1\` VARCHAR(255),
        \`Service Location Address Line 2\` VARCHAR(255),
        \`Service Location City\` VARCHAR(255),
        \`Service Location State\` VARCHAR(255),
        \`Service Location Zip\` VARCHAR(50)
      )
    `);
    await ensureUpcomingTestsPrimaryKey(connection);

    // Delete records not in staging
    const [deleteResult] = await connection.execute(`
      DELETE FROM UpcomingTests 
      WHERE (\`Customer Address Line 1\`, Serial, \`Assembly Location\`) NOT IN (
        SELECT \`Customer Address Line 1\`, Serial, \`Assembly Location\`
        FROM UpcomingTests_Staging
      )
    `);

    // Update existing records from staging
    const [updateResult] = await connection.execute(`
      UPDATE UpcomingTests ut
      JOIN UpcomingTests_Staging uts
        ON ut.Serial = uts.Serial
       AND ut.\`Customer Address Line 1\` = uts.\`Customer Address Line 1\`
       AND ut.\`Assembly Location\` = uts.\`Assembly Location\`
      SET
        ut.\`Parent Customer\` = uts.\`Parent Customer\`,
        ut.\`Customer\` = uts.\`Customer\`,
        ut.\`Customer Phone\` = uts.\`Customer Phone\`,
        ut.\`Customer Email\` = uts.\`Customer Email\`,
        ut.\`Customer Address Line 1\` = uts.\`Customer Address Line 1\`,
        ut.\`Customer Address Line 2\` = uts.\`Customer Address Line 2\`,
        ut.\`Customer City\` = uts.\`Customer City\`,
        ut.\`Customer State\` = uts.\`Customer State\`,
        ut.\`Customer Zip\` = uts.\`Customer Zip\`,
        ut.\`Syncta Id\` = uts.\`Syncta Id\`,
        ut.\`Containment\` = uts.\`Containment\`,
        ut.\`Last Tested On\` = uts.\`Last Tested On\`,
        ut.\`Next Test Due\` = uts.\`Next Test Due\`,
        ut.\`Assembly Status\` = uts.\`Assembly Status\`,
        ut.\`Assembly Type\` = uts.\`Assembly Type\`,
        ut.\`Assembly Manufacturer\` = uts.\`Assembly Manufacturer\`,
        ut.\`Assembly Model\` = uts.\`Assembly Model\`,
        ut.\`Assembly Size\` = uts.\`Assembly Size\`,
        ut.\`Assembly Location\` = uts.\`Assembly Location\`,
        ut.\`Install Date\` = uts.\`Install Date\`,
        ut.\`Testing Frequency\` = uts.\`Testing Frequency\`,
        ut.\`Notification Frequency\` = uts.\`Notification Frequency\`,
        ut.\`Last Notified At\` = uts.\`Last Notified At\`,
        ut.\`Notification Month\` = uts.\`Notification Month\`,
        ut.\`Price\` = uts.\`Price\`,
        ut.\`Test Yearly\` = uts.\`Test Yearly\`,
        ut.\`Water Purveyor\` = uts.\`Water Purveyor\`,
        ut.\`Service Location Name\` = uts.\`Service Location Name\`,
        ut.\`Service Location Phone\` = uts.\`Service Location Phone\`,
        ut.\`Service Location Email\` = uts.\`Service Location Email\`,
        ut.\`Service Location Address Line 1\` = uts.\`Service Location Address Line 1\`,
        ut.\`Service Location Address Line 2\` = uts.\`Service Location Address Line 2\`,
        ut.\`Service Location City\` = uts.\`Service Location City\`,
        ut.\`Service Location State\` = uts.\`Service Location State\`,
        ut.\`Service Location Zip\` = uts.\`Service Location Zip\`
    `);

    // Insert new records
    const [insertResult] = await connection.execute(`
      INSERT INTO UpcomingTests (
        \`Parent Customer\`, \`Customer\`, \`Note\`, \`Action Date\`, \`Customer Phone\`, \`Customer Email\`,
        \`Customer Address Line 1\`, \`Customer Address Line 2\`, \`Customer City\`, \`Customer State\`,
        \`Customer Zip\`, \`Serial\`, \`Syncta Id\`, \`Containment\`, \`Last Tested On\`, \`Next Test Due\`,
        \`Assembly Status\`, \`Assembly Type\`, \`Assembly Manufacturer\`, \`Assembly Model\`, \`Assembly Size\`,
        \`Assembly Location\`, \`Install Date\`, \`Testing Frequency\`, \`Notification Frequency\`,
        \`Last Notified At\`, \`Notification Month\`, \`Price\`, \`Test Yearly\`, \`Water Purveyor\`,
        \`Service Location Name\`, \`Service Location Phone\`, \`Service Location Email\`,
        \`Service Location Address Line 1\`, \`Service Location Address Line 2\`,
        \`Service Location City\`, \`Service Location State\`, \`Service Location Zip\`
      )
      SELECT 
        uts.\`Parent Customer\`, uts.\`Customer\`, '' AS \`Note\`, NULL AS \`Action Date\`, uts.\`Customer Phone\`, uts.\`Customer Email\`,
        uts.\`Customer Address Line 1\`, uts.\`Customer Address Line 2\`, uts.\`Customer City\`, uts.\`Customer State\`,
        uts.\`Customer Zip\`, uts.\`Serial\`, uts.\`Syncta Id\`, uts.\`Containment\`, uts.\`Last Tested On\`, uts.\`Next Test Due\`,
        uts.\`Assembly Status\`, uts.\`Assembly Type\`, uts.\`Assembly Manufacturer\`, uts.\`Assembly Model\`, uts.\`Assembly Size\`,
        uts.\`Assembly Location\`, uts.\`Install Date\`, uts.\`Testing Frequency\`, uts.\`Notification Frequency\`,
        uts.\`Last Notified At\`, uts.\`Notification Month\`, uts.\`Price\`, uts.\`Test Yearly\`, uts.\`Water Purveyor\`,
        uts.\`Service Location Name\`, uts.\`Service Location Phone\`, uts.\`Service Location Email\`,
        uts.\`Service Location Address Line 1\`, uts.\`Service Location Address Line 2\`,
        uts.\`Service Location City\`, uts.\`Service Location State\`, uts.\`Service Location Zip\`
      FROM UpcomingTests_Staging uts
      LEFT JOIN UpcomingTests ut
        ON uts.Serial = ut.Serial
       AND uts.\`Customer Address Line 1\` = ut.\`Customer Address Line 1\`
       AND uts.\`Assembly Location\` = ut.\`Assembly Location\`
      WHERE ut.Serial IS NULL
    `);

    console.log('[upcoming-tests/update] staging -> prod sync', {
      deleted: deleteResult?.affectedRows,
      updated: updateResult?.affectedRows,
      inserted: insertResult?.affectedRows,
    });

    connection.release();
    res.json({
      success: true,
      deleted: deleteResult?.affectedRows,
      updated: updateResult?.affectedRows,
      inserted: insertResult?.affectedRows,
    });
  } catch (error) {
    console.error('Error updating upcoming tests:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      sqlMessage: error.sqlMessage,
    });
    res.status(500).json({
      error: 'Failed to update upcoming tests',
      details: error.message,
      code: error.code,
      sql: error.sqlMessage,
    });
  }
});

// Test Route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    console.error('Request payload exceeded configured limit:', {
      limit: JSON_BODY_LIMIT,
      path: req.originalUrl,
      method: req.method,
    });
    return res.status(413).json({
      error: 'Payload too large',
      details: `Request body exceeds the configured limit of ${JSON_BODY_LIMIT}.`,
    });
  }

  return next(error);
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
