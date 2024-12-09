# Initialize git and push to GitHub
cd C:\Users\denni\invoice-management
git init
git add .
git commit -m "Initial commit"

# Create .gitignore
echo "node_modules/
.env
uploads/
*.log" > .gitignore

# Create GitHub repo and push
git remote add origin https://github.com/dennisyd/ABCBackflow-invoice-management
git push -u origin main