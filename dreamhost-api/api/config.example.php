<?php

return [
    'db' => [
        'host' => 'mysql.example.com',
        'port' => 3306,
        'name' => 'database_name',
        'user' => 'database_user',
        'password' => 'database_password',
        'charset' => 'utf8mb4',
    ],
    'cors' => [
        'allowed_origins' => [
            'http://localhost:3000',
            'https://your-vercel-app.vercel.app',
            'https://abcbackflow.yddconsulting.com',
            'https://yddconsulting.com',
        ],
    ],
    'security' => [
        'api_token' => 'replace-with-a-long-random-token',
        'log_file' => __DIR__ . '/../logs/api.log',
    ],
];
