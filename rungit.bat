cd C:\Users\denni\invoice-management
git init
git add .
git commit -m "Initial commit"

echo "node_modules/
.env
uploads/
*.log" > .gitignore

git remote add origin https://github.com/dennisyd/ABCBackflow-invoice-management
git push -u origin main