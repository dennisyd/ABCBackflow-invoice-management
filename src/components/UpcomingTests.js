import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../services/apiBase';

const COLUMNS = [
  'Serial',
  'Customer',
  'Parent Customer',
  'Note',
  'Action Date',
  'Next Test Due',
  'Last Tested On',
  'Assembly Status',
  'Assembly Type',
  'Assembly Manufacturer',
  'Assembly Model',
  'Assembly Size',
  'Assembly Location',
  'Testing Frequency',
  'Notification Frequency',
  'Price',
  'Test Yearly',
  'Water Purveyor',
  'Customer Phone',
  'Customer Email',
  'Customer Address Line 1',
  'Customer Address Line 2',
  'Customer City',
  'Customer State',
  'Customer Zip',
  'Service Location Name',
  'Service Location Phone',
  'Service Location Email',
  'Service Location Address Line 1',
  'Service Location Address Line 2',
  'Service Location City',
  'Service Location State',
  'Service Location Zip',
  'Syncta Id',
  'Containment',
  'Install Date',
  'Last Notified At',
  'Notification Month',
];

const UPCOMING_TEST_STORAGE_KEY = 'selectedUpcomingTestKey';

const buildUpcomingTestKey = (test) =>
  `${test?.Serial || ''}::${test?.['Customer Address Line 1'] || ''}::${test?.['Assembly Location'] || ''}`;

const UpcomingTests = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedSerial, setSelectedSerial] = useState('');
  const [selectedTest, setSelectedTest] = useState(null);
  const [note, setNote] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [serialQuery, setSerialQuery] = useState('');

  const fetchUpcomingTests = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/upcoming-tests?_=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to load upcoming tests');
      }
      const data = await response.json();
      setTests(data);
      setError(null);

      // Restore the last selected row by its full composite key.
      const lastSelectedKey = localStorage.getItem(UPCOMING_TEST_STORAGE_KEY);
      const match = data.find((t) => buildUpcomingTestKey(t) === lastSelectedKey);
      if (match) {
        applySelection(match);
      } else if (data.length) {
        applySelection(data[0]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUpcomingTests();
  }, [fetchUpcomingTests]);

  const applySelection = (test) => {
    if (!test) return;
    setSelectedSerial(test.Serial);
    setSelectedTest(test);
    setSerialQuery(String(test.Serial));
    setNote(test.Note || '');
    setActionDate(
      test['Action Date']
        ? new Date(test['Action Date']).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    );
    localStorage.setItem(UPCOMING_TEST_STORAGE_KEY, buildUpcomingTestKey(test));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSerialSelect = (serial, testKey = null) => {
    const match = tests.find((t) => {
      if (testKey) {
        return buildUpcomingTestKey(t) === testKey;
      }
      return String(t.Serial) === String(serial);
    });
    if (match) {
      applySelection(match);
    }
  };

  const handleSerialInputChange = (e) => {
    const value = e.target.value;
    setSerialQuery(value);
    const exact = tests.find((t) => String(t.Serial) === value);
    if (exact) {
      applySelection(exact);
    }
  };

  const handleUpdate = async () => {
    if (!selectedSerial) return;
    try {
      const response = await apiFetch('/upcoming-tests/update-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: selectedSerial,
          customerAddressLine1: selectedTest?.['Customer Address Line 1'] || '',
          assemblyLocation: selectedTest?.['Assembly Location'] || '',
          note,
          actionDate,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to update test');
      }
      await fetchUpcomingTests();
      alert('Upcoming test updated successfully!');
    } catch (err) {
      alert('Failed to update test: ' + err.message);
    }
  };

  const filteredTests = tests.filter((t) => {
    if (!serialQuery.trim()) return true;
    return String(t.Serial).startsWith(serialQuery.trim());
  });

  const columns = COLUMNS.filter((col) => tests.length && col in tests[0]);

  return (
    <div className="p-6 bg-blue-50 min-h-screen flex flex-col items-center">
      <div className="w-full max-w-6xl">
        <h1 className="text-4xl font-bold mb-6 text-gray-900 text-center">Upcoming Tests</h1>

        <div className="flex flex-col md:flex-row md:items-center mb-6 gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2 text-gray-700">Choose a Serial #</label>
            <input
              type="text"
              value={serialQuery}
              onChange={handleSerialInputChange}
              placeholder="Type or paste Serial #"
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100 mb-2"
              list="serial-options"
            />
            <datalist id="serial-options">
              {filteredTests.map((t) => (
                <option
                  key={`${t.Serial}::${t['Customer Address Line 1'] || ''}::${t['Assembly Location'] || ''}`}
                  value={t.Serial}
                />
              ))}
            </datalist>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchUpcomingTests}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded border border-red-300">
            {error}
          </div>
        )}

        {selectedTest && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Serial</label>
                <div className="p-2 border border-blue-500 text-blue-500 font-bold rounded-md bg-white">
                  {selectedSerial}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Customer</label>
                <div className="p-2 border border-blue-500 text-blue-500 font-bold rounded-md bg-white">
                  {selectedTest.Customer}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">Action Date</label>
                <input
                  type="date"
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Enter a Note - Initials, Date, Note -- Add Each Note on a Separate Line!
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md h-32 bg-gray-100"
              />
            </div>

            <div className="flex justify-center mb-6">
              <button
                className="bg-blue-500 text-white px-6 py-3 rounded-md shadow-md hover:bg-blue-600 disabled:opacity-50"
                onClick={handleUpdate}
                disabled={!selectedSerial}
              >
                Update Test {selectedSerial} for {selectedTest.Customer}
              </button>
            </div>
          </>
        )}

        {tests.length > 0 && (
          <div className="p-4 bg-white border rounded-md shadow-md overflow-x-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">
                Upcoming Test Records (
                <span className="text-red-500">{tests.filter((t) => !t.Note).length} Not Yet Contacted</span>
                )
              </h2>
            </div>
            <table className="w-full table-auto border-collapse">
              <thead>
                <tr className="bg-gray-200 text-left text-sm font-semibold text-gray-700">
                  {columns.map((col) => (
                    <th key={col} className="border p-3">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm text-gray-600">
                {tests.map((row) => (
                  <tr
                    key={`${row.Serial}::${row['Customer Address Line 1'] || ''}::${row['Assembly Location'] || ''}`}
                    className="hover:bg-gray-100 cursor-pointer"
                    onDoubleClick={() => handleSerialSelect(row.Serial, buildUpcomingTestKey(row))}
                  >
                    {columns.map((col) => (
                      <td
                        key={col}
                        className={`border p-3 ${col === 'Note' ? 'whitespace-pre-line' : 'whitespace-nowrap'}`}
                        style={col === 'Note' ? { minWidth: '320px' } : undefined}
                      >
                        {row[col]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpcomingTests;
