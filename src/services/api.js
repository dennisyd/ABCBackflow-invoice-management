import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

export const fetchInvoices = async () => {
  try {
    const response = await axios.get(`${API_URL}/invoices`);
    return response.data;
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw error;
  }
};

export const updateInvoice = async (invoiceId, note, actionDate) => {
  try {
    const response = await axios.post(`${API_URL}/invoices/update`, {
      invoiceId,
      note,
      actionDate
    });
    return response.data;
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw error;
  }
};

// src/services/api.js
export const downloadInvoices = async () => {
  try {
    const response = await axios.get(`${API_URL}/invoices/download`, {
      responseType: 'blob'  // Important for handling file downloads
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
    link.href = url;
    link.setAttribute('download', `master_invoices_${today}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error('Error downloading invoices:', error);
    throw error;
  }
};

// Add these to src/services/api.js
export const fetchQuotes = async () => {
  try {
    const response = await axios.get(`${API_URL}/quotes`);
    return response.data;
  } catch (error) {
    console.error('Error fetching quotes:', error);
    throw error;
  }
};

export const updateQuote = async (quoteId, note, actionDate) => {
  try {
    const response = await axios.post(`${API_URL}/quotes/update`, {
      quoteId,
      note,
      actionDate
    });
    return response.data;
  } catch (error) {
    console.error('Error updating quote:', error);
    throw error;
  }
};