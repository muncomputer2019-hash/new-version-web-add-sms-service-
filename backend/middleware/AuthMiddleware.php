<?php
declare(strict_types=1);

namespace MunComputer\Middleware;

use MunComputer\Services\ResponseService;
use PDO;

class AuthMiddleware
{
    public static function requireAuth(PDO $db): ?array
    {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (!preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
            ResponseService::error('Authentication token required.', 401);
            return null;
        }

        $tokenHash = hash('sha256', trim($matches[1]));
        $stmt = $db->prepare(
            "SELECT u.id, u.full_name, u.email, r.slug AS role_slug
             FROM user_sessions s
             INNER JOIN users u ON u.id = s.user_id
             INNER JOIN roles r ON r.id = u.role_id
             WHERE s.token_hash = :hash AND s.status = 'active' AND s.expires_at > NOW()
             LIMIT 1"
        );
        $stmt->execute([':hash' => $tokenHash]);
        $user = $stmt->fetch();

        if (!$user) {
            ResponseService::error('Invalid or expired session token.', 401);
            return null;
        }

        return $user;
    }
}
