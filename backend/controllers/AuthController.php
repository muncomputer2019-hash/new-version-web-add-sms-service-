<?php
declare(strict_types=1);

namespace MunComputer\Controllers;

use MunComputer\Middleware\RequestValidator;
use MunComputer\Services\ResponseService;
use PDO;

class AuthController
{
    public const REMEMBER_ME_MINUTES = 240; // Exactly 4 hours (240 minutes)
    public const STANDARD_SESSION_MINUTES = 60;

    public function __construct(private readonly PDO $db)
    {
    }

    public function login(array $payload): void
    {
        // Users must authenticate using their unique MUN COMPUTER User ID (email never replaces User ID)
        $errors = RequestValidator::validate($payload, [
            'userId' => ['required'],
            'password' => ['required'],
        ]);

        if (!empty($errors)) {
            ResponseService::error('Validation failed.', 422, $errors);
            return;
        }

        $stmt = $this->db->prepare(
            "SELECT id, user_code, full_name, email, password_hash, status FROM users WHERE UPPER(user_code) = UPPER(:uid) LIMIT 1"
        );
        $stmt->execute([':uid' => trim((string) $payload['userId'])]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== 'ACTIVE' || !password_verify((string) $payload['password'], $user['password_hash'])) {
            ResponseService::error('Invalid User ID or password.', 401);
            return;
        }

        $rememberMe = !empty($payload['rememberMe']);
        $durationMinutes = $rememberMe ? self::REMEMBER_ME_MINUTES : self::STANDARD_SESSION_MINUTES;

        $rawToken = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $rawToken);

        $insert = $this->db->prepare(
            "INSERT INTO user_sessions (user_id, token_hash, remember_me, expires_at, max_allowed_expires_at, status)
             VALUES (:uid, :hash, :rem, DATE_ADD(NOW(), INTERVAL :mins1 MINUTE), DATE_ADD(NOW(), INTERVAL :mins2 MINUTE), 'active')"
        );
        $insert->execute([
            ':uid' => $user['id'],
            ':hash' => $tokenHash,
            ':rem' => $rememberMe ? 1 : 0,
            ':mins1' => $durationMinutes,
            ':mins2' => $durationMinutes,
        ]);

        ResponseService::success([
            'token' => $rawToken,
            'sessionDurationMinutes' => $durationMinutes,
            'rememberMe' => $rememberMe,
            'user' => [
                'id' => (int) $user['id'],
                'userId' => $user['user_code'],
                'fullName' => $user['full_name'],
                'email' => $user['email'],
            ],
        ], 'Authenticated successfully.');
    }
}
