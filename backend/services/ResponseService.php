<?php
declare(strict_types=1);

namespace MunComputer\Services;

class ResponseService
{
    public static function success(
        mixed $data = null,
        string $message = 'OK',
        int $statusCode = 200,
        array $meta = []
    ): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode([
            'success' => true,
            'message' => $message,
            'data' => $data,
            'meta' => array_merge([
                'timestamp' => gmdate('c'),
                'requestId' => bin2hex(random_bytes(8)),
            ], $meta),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    public static function error(
        string $message,
        int $statusCode = 400,
        array $errors = []
    ): void {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');

        $payload = [
            'success' => false,
            'message' => $message,
            'data' => null,
            'meta' => [
                'timestamp' => gmdate('c'),
                'requestId' => bin2hex(random_bytes(8)),
            ],
        ];

        if (!empty($errors)) {
            $payload['errors'] = $errors;
        }

        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
