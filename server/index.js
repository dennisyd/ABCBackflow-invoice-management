require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const pool = require('./config/db');
const fs = require('fs');
const xlsx = require('xlsx');

const app = express();
app.use(cors());
app.use(express.json());

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

// Test Route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running!' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
