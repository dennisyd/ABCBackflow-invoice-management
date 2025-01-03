import React, { useState, useEffect } from 'react';
import { fetchInvoices, updateInvoice } from '../services/api';

const InvoicesManagement = () => {
  const [selectedInvoice, setSelectedInvoice] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [note, setNote] = useState('');
  const [actionDate, setActionDate] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      let data = await fetchInvoices();
  
      // Sort invoices by Due Date in descending order
      data.sort((a, b) => new Date(b['Due Date']) - new Date(a['Due Date']));
  
      setInvoices(data);
  
      // Restore the selected invoice from localStorage, if available
      const lastSelectedInvoice = localStorage.getItem('selectedInvoice');
      const validLastInvoice = data.find((inv) => inv.Invoice == lastSelectedInvoice);
  
      if (validLastInvoice) {
        handleInvoiceSelect(lastSelectedInvoice, data);
      } else if (data.length > 0) {
        // If no valid saved invoice, default to the first (now sorted by date)
        handleInvoiceSelect(data[0].Invoice, data);
      }
  
      setLoading(false);
    } catch (err) {
      setError('Failed to load invoices');
      setLoading(false);
    }
  };
  
  

  const handleInvoiceSelect = (invoiceId, invoiceList = invoices) => {
    const selected = invoiceList.find((inv) => String(inv.Invoice) === String(invoiceId));
    if (selected) {
      setSelectedInvoice(invoiceId);
      setSelectedCustomer(selected['Customer Name'] || '');
      setNote(selected.Note || '');
      setActionDate(
        selected['Action Date']
          ? new Date(selected['Action Date']).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0]
      );

      // Save the selected invoice to localStorage
      localStorage.setItem('selectedInvoice', invoiceId);

      // Scroll to the top when an invoice is selected
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleUpdate = async () => {
    try {
      await updateInvoice(selectedInvoice, note, actionDate);
      await loadInvoices();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      alert('Invoice updated successfully!');
    } catch (error) {
      alert('Failed to update invoice: ' + error.message);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch('/api/invoices/download');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `master_invoices_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
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
        <h1 className="text-4xl font-bold mb-6 text-gray-900 text-center">Invoice Management</h1>

        {/* Dropdown Section */}
        <div className="flex flex-col md:flex-row md:items-center mb-6 gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2 text-gray-700">Choose an Invoice</label>
            <select
              value={selectedInvoice}
              onChange={(e) => handleInvoiceSelect(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-100"
            >
              {invoices.map((invoice) => (
                <option key={invoice.Invoice} value={invoice.Invoice}>
                  {invoice.Invoice}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Invoice Details */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Invoice:</label>
            <div className="p-2 border border-blue-500 text-blue-500 font-bold rounded-md">
              {selectedInvoice}
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
            Update Invoice {selectedInvoice} for {selectedCustomer}
          </button>
        </div>

        {/* Invoice Table */}
        <div className="p-4 bg-white border rounded-md shadow-md overflow-x-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">
              Invoice Records (<span className="text-red-500">{invoices.filter((inv) => !inv.Note).length} Customers Not Yet Contacted</span>)
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
                <th className="border p-3">Invoice</th>
                <th className="border p-3">Due Date</th>
                <th className="border p-3">Note</th>
                <th className="border p-3">Action Date</th>
                <th className="border p-3">Customer Name</th>
                <th className="border p-3">Service Location</th>
                <th className="border p-3">Rows</th>
                <th className="border p-3">Customer Email</th>
                <th className="border p-3">PO Number</th>
                <th className="border p-3">Phone 1</th>
                <th className="border p-3">Phone 2</th>
                <th className="border p-3">Total Amount</th>
                <th className="border p-3">Customer Address</th>
                <th className="border p-3">Service Location Contact</th>
                <th className="border p-3">Service Location Phone</th>
                <th className="border p-3">Parent Customer Name</th>
                <th className="border p-3">Parent Customer Phone</th>
                <th className="border p-3">Parent Customer Address</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-600">
              {invoices.map((invoice) => (
                <tr
                  key={invoice.Invoice}
                  className="hover:bg-gray-100 cursor-pointer"
                  onDoubleClick={() => handleInvoiceSelect(invoice.Invoice)}
                >
                  <td className="border p-3">{invoice.Invoice}</td>
                  <td className="border p-3">{invoice['Due Date']}</td>
                  <td className="border p-3">{invoice.Note}</td>
                  <td className="border p-3">{invoice['Action Date']}</td>
                  <td className="border p-3">{invoice['Customer Name']}</td>
                  <td className="border p-3">{invoice['Service Location']}</td>
                  <td className="border p-3">{invoice.Rows}</td>
                  <td className="border p-3">{invoice['Customer Email']}</td>
                  <td className="border p-3">{invoice['PO Number']}</td>
                  <td className="border p-3">{invoice['Phone 1']}</td>
                  <td className="border p-3">{invoice['Phone 2']}</td>
                  <td className="border p-3">{invoice['Total Amount']}</td>
                  <td className="border p-3">{invoice['Customer Address']}</td>
                  <td className="border p-3">{invoice['Service Location Contact']}</td>
                  <td className="border p-3">{invoice['Service Location Phone']}</td>
                  <td className="border p-3">{invoice['Parent Customer Name']}</td>
                  <td className="border p-3">{invoice['Parent Customer Phone']}</td>
                  <td className="border p-3">{invoice['Parent Customer Address']}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InvoicesManagement;
