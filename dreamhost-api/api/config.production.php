<?php

return [
    'db' => [
        'host' => 'mysql.pythonmoney.com',
        'port' => 3306,
        'name' => 'abcbackflow',
        'user' => 'abc_backflow',
        'password' => 'ABCydd$2023',
        'charset' => 'utf8mb4',
    ],
    'cors' => [
        'allowed_origins' => [
            'http://localhost:3000',
            'https://your-vercel-project.vercel.app',
            'https://abcbackflow.yddconsulting.com',
            'https://yddconsulting.com',
        ],
    ],
    'security' => [
        'api_token' => '8f4c2d91b7e64a0ea3c9f1d6b2a8e5c7f0d4a1b9c6e3f8a2d7b5c1e9f4a6d8b',
        'log_file' => __DIR__ . '/../logs/api.log',
    ],
];
