import axios from 'axios';
import { API_BASE, API_TOKEN } from './apiBase';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: API_TOKEN ? { 'X-API-Token': API_TOKEN } : {},
});

export const fetchInvoices = async () => {
  try {
    // Timestamp param prevents the browser from serving a cached response
    const response = await apiClient.get('/invoices', { params: { _: Date.now() } });
    return response.data;
  } catch (error) {
    console.error('Error fetching invoices:', error);
    throw error;
  }
};

export const updateInvoice = async (invoiceId, note, actionDate) => {
  try {
    const response = await apiClient.post('/invoices/update', {
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
    const response = await apiClient.get('/invoices/download', {
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
    const response = await apiClient.get('/quotes', { params: { _: Date.now() } });
    return response.data;
  } catch (error) {
    console.error('Error fetching quotes:', error);
    throw error;
  }
};

export const updateQuote = async (quoteId, note, actionDate) => {
  try {
    const response = await apiClient.post('/quotes/update', {
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
