import React, { useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { apiFetch } from '../services/apiBase';

const UpcomingTestsUpdate = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [sortedData, setSortedData] = useState(null);
  const [error, setError] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dbData, setDbData] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [viewMode, setViewMode] = useState('db'); // 'db' or 'upload'

  const onDrop = (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file.name.toLowerCase().startsWith('upcoming')) {
      setError('Invalid file format! Please upload files with names starting with "upcoming".');
      return;
    }

    setSelectedFile(file);
    processFile(file);
    setViewMode('upload');
  };

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false });

        const sorted = [...jsonData].sort((a, b) => {
          const dateKey = 'Next Test Due' in a ? 'Next Test Due' : 'Last Tested On';
          const dateA = new Date(a[dateKey]);
          const dateB = new Date(b[dateKey]);
          return dateA - dateB;
        });

        setSortedData(sorted);
        setError(null);
      } catch (err) {
        console.error('Error processing file:', err);
        setError('Error processing file. Please ensure it is a valid Excel file.');
      }
    };

    reader.onerror = () => {
      setError('Error reading file. Please try again.');
    };

    reader.readAsArrayBuffer(file);
  };

  const fetchDbData = async () => {
    try {
      setDbLoading(true);
      const response = await apiFetch('/upcoming-tests');
      if (!response.ok) {
        throw new Error('Failed to load upcoming tests from database');
      }
      const data = await response.json();
      setDbData(data);
      setDbError(null);
    } catch (err) {
      setDbError(err.message);
    } finally {
      setDbLoading(false);
    }
  };

  const updateDatabase = async () => {
    if (!sortedData) {
      alert('No data available to update the database.');
      return;
    }

    setIsUpdating(true);
    try {
      const stagingResponse = await apiFetch('/upcoming-tests/staging', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sortedData),
      });

      if (!stagingResponse.ok) {
        throw new Error('Failed to update staging table');
      }

      const updateResponse = await apiFetch('/upcoming-tests/update', {
        method: 'POST',
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update main database');
      }

      alert('Upcoming tests database updated successfully!');
      setSelectedFile(null);
      setSortedData(null);
      await fetchDbData();
    } catch (err) {
      console.error('Error updating database:', err);
      alert('Failed to update the database: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    fetchDbData();
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  return (
    <div className="p-6 bg-blue-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Upcoming Tests Update</h1>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Choose a file</label>
          <div
            {...getRootProps()}
            className="p-4 border-2 border-dashed rounded-lg text-center cursor-pointer hover:border-blue-500"
          >
            <input {...getInputProps()} />
            <p className="text-gray-600">Limit 200MB per file - XLSX</p>
          </div>
        </div>

        {selectedFile && (
          <div className="mb-4 flex items-center">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <svg
                  className="w-6 h-6 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm text-gray-600">{selectedFile.name}</span>
                <span className="text-sm text-gray-500">({Math.round(selectedFile.size / 1024)} KB)</span>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedFile(null);
                setSortedData(null);
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

        {dbError && (
          <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {dbError}
          </div>
        )}

        {dbData.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-2xl font-bold">Current Upcoming Tests (Database)</h2>
              <button
                onClick={fetchDbData}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
                disabled={dbLoading}
              >
                {dbLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            {viewMode === 'db' && (
              <div className="overflow-x-auto bg-white rounded-lg shadow">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(dbData[0] || {}).map((key) => (
                        <th
                          key={key}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {dbData.map((row, index) => (
                      <tr key={index}>
                        {Object.values(row).map((value, idx) => (
                          <td key={idx} className="px-6 py-4 whitespace-nowrap">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {sortedData && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('db')}
                  className={`px-3 py-2 rounded ${viewMode === 'db' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
                >
                  View Database
                </button>
                <button
                  onClick={() => setViewMode('upload')}
                  className={`px-3 py-2 rounded ${viewMode === 'upload' ? 'bg-blue-500 text-white' : 'bg-white border'}`}
                >
                  View Uploaded File
                </button>
              </div>
              <button
                onClick={updateDatabase}
                disabled={isUpdating}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {isUpdating ? 'Updating Database...' : 'Update Database'}
              </button>
            </div>

            {viewMode === 'upload' && (
              <div className="overflow-x-auto bg-white rounded-lg shadow">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(sortedData[0] || {}).map((key) => (
                        <th
                          key={key}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedData.map((row, index) => (
                      <tr key={index}>
                        {Object.values(row).map((value, idx) => (
                          <td key={idx} className="px-6 py-4 whitespace-nowrap">
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default UpcomingTestsUpdate;
