import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';

const extractText = (html) => {
  try {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  } catch {
    return html;
  }
};

const QuotesUpdate = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedData, setUploadedData] = useState(null);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().startsWith('quote')) {
      setError('Invalid file format! Please upload files with names starting with "quote"');
      return;
    }

    setSelectedFile(file);
    processFile(file);
  };

  const processFile = (file) => {
    Papa.parse(file, {
      complete: (results) => {
        let data = results.data;

        // Remove totals row
        data = data.filter(row => row.Name !== 'Totals');

        // Clean and transform data to match database schema
        data = data
          .map(row => ({
            Name: extractText(row.Name || ''), // Clean HTML from Name
            Quote: extractText(row.Invoice || ''), // Clean HTML and map Invoice to Quote
            Note: '', // Default empty Note
            'Action Date': '', // Default empty Action Date
            'Total Amount': parseFloat((row['Total Amount'] || '').replace(/[^0-9.-]+/g, '')) || 0, // Clean and parse Total Amount
          }))
          .filter(row => row.Name.trim() !== ''); // Skip records where Name is blank

        console.log('Transformed Data:', data); // Debugging

        setUploadedData(data);
        setError(null);
      },
      header: true,
      error: (error) => {
        console.error('Error parsing file:', error);
        setError('Error processing file. Please ensure it is a valid CSV file.');
      },
    });
  };

  const updateDatabase = async () => {
    if (!uploadedData) {
      alert('No data available to update the database.');
      return;
    }

    setIsUpdating(true);
    try {
      // Step 1: Upload data to staging
      const stagingResponse = await fetch('http://localhost:5000/api/quotes/staging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadedData),
      });

      if (!stagingResponse.ok) {
        throw new Error('Failed to update staging table');
      }

      console.log('Successfully uploaded to staging table');

      // Brief pause for staging update
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Sync database (delete outdated and insert new quotes)
      const syncResponse = await fetch('http://localhost:5000/api/quotes/update-from-staging', {
        method: 'POST',
      });

      if (!syncResponse.ok) {
        throw new Error('Failed to update from staging');
      }

      alert('Database updated successfully!');
      setSelectedFile(null);
      setUploadedData(null);
    } catch (error) {
      console.error('Error updating database:', error);
      alert('Failed to update the database: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
  });

  const columnOrder = ['Name', 'Quote', 'Note', 'Action Date', 'Total Amount'];

  return (
    <div className="p-6 bg-blue-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Quotes Update</h1>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Choose a file</label>
          <div
            {...getRootProps()}
            className="p-4 border-2 border-dashed rounded-lg text-center cursor-pointer hover:border-blue-500"
          >
            <input {...getInputProps()} />
            <p className="text-gray-600">Drop a CSV file here, or click to select</p>
          </div>
        </div>

        {selectedFile && (
          <div className="mb-4 flex items-center">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-gray-600">{selectedFile.name}</span>
                <span className="text-sm text-gray-500">({Math.round(selectedFile.size / 1024)} KB)</span>
              </div>
            </div>
            <button 
              onClick={() => {
                setSelectedFile(null);
                setUploadedData(null);
              }} 
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {uploadedData && (
          <>
            <button
              onClick={updateDatabase}
              disabled={isUpdating}
              className="mb-6 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isUpdating ? 'Updating Database...' : 'Update Database'}
            </button>

            <div className="overflow-x-auto bg-white rounded-lg shadow">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {columnOrder.map((column) => (
                      <th key={column} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploadedData.map((row, index) => (
                    <tr key={index}>
                      {columnOrder.map((column) => (
                        <td key={column} className="px-6 py-4 whitespace-nowrap">
                          {row[column]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default QuotesUpdate;
