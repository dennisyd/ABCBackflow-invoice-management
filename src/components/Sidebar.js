import React from 'react';
import { Link } from 'react-router-dom';

const Sidebar = () => {
  return (
    <div className="w-64 h-screen bg-blue-800 text-white p-4">
      <h1 className="text-xl font-bold mb-8">ABC Invoice Management</h1>
      <nav>
        <ul className="space-y-2">
          <li>
            <Link to="/" className="block p-2 hover:bg-blue-700 rounded">
              Invoices Management
            </Link>
          </li>
          <li>
            <Link to="/past-due" className="block p-2 hover:bg-blue-700 rounded">
              Past Due Invoices
            </Link>
          </li>
          <li>
            <Link to="/quotes" className="block p-2 hover:bg-blue-700 rounded">
              Quotes Management
            </Link>
          </li>
          <li>
            <Link to="/quotes-update" className="block p-2 hover:bg-blue-700 rounded">
              Quotes Update
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;