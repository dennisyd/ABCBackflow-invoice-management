require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');

// Debug connection parameters
console.log('Attempting database connection with:', {
  host: process.env.DB_HOST || 'not set',
  user: process.env.DB_USER || 'not set',
  database: process.env.DB_NAME || 'not set',
  port: process.env.DB_PORT || 'not set'
});

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Add global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');
    
    // Test query to validate connection
    const [rows] = await connection.execute('SELECT 1');
    console.log('Connection test query successful');
    
    connection.release();
  } catch (error) {
    console.error('Error connecting to the database:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage,
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      database: process.env.DB_NAME
    });
  }
}

testConnection();

module.exports = pool;