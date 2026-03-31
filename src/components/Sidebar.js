import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from '../auth';

const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="w-64 h-screen bg-blue-800 text-white p-4">
      <h1 className="text-xl font-bold mb-8">ABC Backflow</h1>
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
          <li>
            <Link to="/upcoming-tests" className="block p-2 hover:bg-blue-700 rounded">
              Upcoming Tests
            </Link>
          </li>
          <li>
            <Link to="/upcoming-tests-update" className="block p-2 hover:bg-blue-700 rounded">
              Upcoming Tests Update
            </Link>
          </li>
        </ul>
      </nav>
      <button
        type="button"
        onClick={handleLogout}
        className="mt-8 w-full rounded bg-blue-950 px-4 py-2 text-left hover:bg-blue-900"
      >
        Log Out
      </button>
    </div>
  );
};

export default Sidebar;
