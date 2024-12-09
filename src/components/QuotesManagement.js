import React, { useState, useEffect } from 'react';
import { fetchQuotes, updateQuote } from '../services/api';

const QuotesManagement = () => {
  const [selectedQuote, setSelectedQuote] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [note, setNote] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadQuotes();
  }, []);

  const loadQuotes = async () => {
    try {
      let data = await fetchQuotes();

      // Format Total Amount with $ sign
      data = data.map(quote => ({
        ...quote,
        'Total Amount': quote['Total Amount'] 
          ? `$${parseFloat(quote['Total Amount'].replace(/[^0-9.-]+/g, '')).toFixed(2)}`
          : '$0.00',
      }));

      // Sort quotes by Quote number in descending order
      data.sort((a, b) => String(b.Quote).localeCompare(String(a.Quote)));

      setQuotes(data);

      // Restore the selected quote from localStorage, if available
      const lastSelectedQuote = localStorage.getItem('selectedQuote');
      const validLastQuote = data.find((q) => q.Quote == lastSelectedQuote);

      if (validLastQuote) {
        handleQuoteSelect(lastSelectedQuote, data);
      } else if (data.length > 0) {
        handleQuoteSelect(data[0].Quote, data);
      }

      setLoading(false);
    } catch (err) {
      setError('Failed to load quotes');
      setLoading(false);
    }
  };

  const handleQuoteSelect = (quoteId, quoteList = quotes) => {
    const selected = quoteList.find((q) => String(q.Quote) === String(quoteId));
    if (selected) {
      setSelectedQuote(quoteId);
      setSelectedCustomer(selected.Name || '');
      setNote(selected.Note || '');

      // Automatically set Action Date 3 months ahead if missing
      const threeMonthsAhead = new Date();
      threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);
      const formattedDate = threeMonthsAhead.toISOString().split('T')[0];

      setActionDate(
        selected['Action Date']
          ? new Date(selected['Action Date']).toISOString().split('T')[0]
          : formattedDate
      );

      if (!selected['Action Date']) {
        alert(`Action Date was missing. Automatically set to ${formattedDate}`);
      }

      localStorage.setItem('selectedQuote', quoteId);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleUpdate = async () => {
    try {
      await updateQuote(selectedQuote, note, actionDate);
      await loadQuotes();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      alert('Quote updated successfully!');
    } catch (error) {
      alert('Failed to update quote: ' + error.message);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/quotes/download');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotes_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to download: ' + error.message);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-6 bg-blue-50 min-h-screen flex flex-col items-center">
      <div className="w-full max-w-6xl">
        <h1 className="text-4xl font-bold mb-6 text-gray-900 text-center">Quotes Management</h1>

        {/* Dropdown Section */}
        <div className="flex flex-col md:flex-row md:items-center mb-6 gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2 text-gray-700">Choose a Quote</label>
            <select
              value={selectedQuote}
              onChange={(e) => handleQuoteSelect(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
            >
              {quotes.map((quote) => (
                <option key={quote.Quote} value={quote.Quote}>
                  {quote.Quote}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Quote Details */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Quote:</label>
            <div className="p-2 border border-blue-500 text-blue-500 font-bold rounded-md">
              {selectedQuote}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Customer:</label>
            <div className="p-2 border border-blue-500 text-blue-500 font-bold rounded-md">
              {selectedCustomer}
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

        {/* Notes Section */}
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

        {/* Update Button */}
        <div className="flex justify-center mb-6">
          <button
            className="bg-blue-500 text-white px-6 py-3 rounded-md shadow-md hover:bg-blue-600"
            onClick={handleUpdate}
          >
            Update Quote {selectedQuote} for {selectedCustomer}
          </button>
        </div>

        {/* Quotes Table */}
        <div className="p-4 bg-white border rounded-md shadow-md overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">
              Quote Records (<span className="text-red-500">{quotes.filter((q) => !q.Note).length} Customers Not Yet Contacted</span>)
            </h2>
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded-md"
              onClick={handleDownload}
            >
              Download
            </button>
          </div>

          <table className="w-full table-auto border-collapse">
            <thead>
              <tr className="bg-gray-200 text-left text-sm font-semibold text-gray-700">
                <th className="border p-3">Quote</th>
                <th className="border p-3">Name</th>
                <th className="border p-3">Note</th>
                <th className="border p-3">Action Date</th>
                <th className="border p-3">Total Amount</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {quotes.map((quote) => (
                <tr
                  key={quote.Quote}
                  className="hover:bg-gray-100 cursor-pointer"
                  onDoubleClick={() => handleQuoteSelect(quote.Quote)}
                >
                  <td className="border p-3">{quote.Quote}</td>
                  <td className="border p-3">{quote.Name}</td>
                  <td className="border p-3">{quote.Note}</td>
                  <td className="border p-3">{quote['Action Date']}</td>
                  <td className="border p-3">{quote['Total Amount']}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QuotesManagement;
