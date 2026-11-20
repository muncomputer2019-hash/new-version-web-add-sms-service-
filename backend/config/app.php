<?php
declare(strict_types=1);

return [
    'app_name' => getenv('APP_NAME') ?: 'MUN COMPUTER',
    'app_env' => getenv('APP_ENV') ?: 'local',
    'app_version' => '1.0.0',
    'api_base_url' => (getenv('APP_URL') ?: 'http://localhost:8000') . '/api/v1',
    'frontend_url' => getenv('FRONTEND_URL') ?: 'http://localhost:3000',
    'jwt_secret' => getenv('JWT_SECRET') ?: 'change_me_in_production',
    'jwt_ttl_minutes' => (int) (getenv('JWT_TTL_MINUTES') ?: 120),
    'pagination' => [
        'default_per_page' => 10,
        'max_per_page' => 100,
    ],
];
