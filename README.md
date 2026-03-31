# ABC Backflow Invoice Management

## First-Time Setup (Do This Once)

1. Install **Node.js** from https://nodejs.org/ — download the **LTS** version
2. Run through the Node.js installer with all default options
3. Restart your computer after installing Node.js

## Starting the Application

1. Double-click **start-application.bat**
2. The first time you run it, it will install dependencies automatically — this may take **3-5 minutes**
3. Once you see *"Open your browser to: http://localhost:3000"*, open your browser and go to:
   **http://localhost:3000**

> Keep the black command window open while using the application. Closing it will stop the app.

## Stopping the Application

Close the black command window, or press **Ctrl + C** inside it.

## Troubleshooting

**App won't start / errors on launch:**
- Delete the `node_modules` folder in the main folder
- Delete the `node_modules` folder inside the `server` folder
- Double-click `start-application.bat` again — it will reinstall everything

**Browser shows "This site can't be reached":**
- Make sure the black command window is still open
- Wait a few more seconds and refresh the page

**"Node.js is not installed" message:**
- Install Node.js from https://nodejs.org/ (LTS version) and restart your computer
