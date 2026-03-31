import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { isAuthenticated } from './auth';
import LoginPage from './components/LoginPage';
import Sidebar from './components/Sidebar';
import InvoicesManagement from './components/InvoicesManagement';
import PastDueInvoices from './components/PastDueInvoices';
import QuotesManagement from './components/QuotesManagement';
import QuotesUpdate from './components/QuotesUpdate';
import UpcomingTests from './components/UpcomingTests';
import UpcomingTestsUpdate from './components/UpcomingTestsUpdate';

const ProtectedLayout = () => {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 p-6 bg-blue-50 min-h-screen">
        <Routes>
          <Route path="/" element={<InvoicesManagement />} />
          <Route path="/past-due" element={<PastDueInvoices />} />
          <Route path="/quotes" element={<QuotesManagement />} />
          <Route path="/quotes-update" element={<QuotesUpdate />} />
          <Route path="/upcoming-tests" element={<UpcomingTests />} />
          <Route path="/upcoming-tests-update" element={<UpcomingTestsUpdate />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </Router>
  );
}

export default App;
