import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import InvoicesManagement from './components/InvoicesManagement';
import PastDueInvoices from './components/PastDueInvoices';
import QuotesManagement from './components/QuotesManagement';
import QuotesUpdate from './components/QuotesUpdate';

function App() {
  return (
    <Router>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 bg-blue-50 min-h-screen">
          <Routes>
            <Route path="/" element={<InvoicesManagement />} />
            <Route path="/past-due" element={<PastDueInvoices />} />
            <Route path="/quotes" element={<QuotesManagement />} />
            <Route path="/quotes-update" element={<QuotesUpdate />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;