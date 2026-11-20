<?php
declare(strict_types=1);

namespace MunComputer\Services;

class PaginationService
{
    public static function parseParams(array $query, int $defaultPerPage = 10, int $maxPerPage = 100): array
    {
        $page = max(1, (int) ($query['page'] ?? 1));
        $perPage = min($maxPerPage, max(1, (int) ($query['per_page'] ?? $defaultPerPage)));
        $offset = ($page - 1) * $perPage;

        return [
            'page' => $page,
            'per_page' => $perPage,
            'offset' => $offset,
        ];
    }

    public static function buildMeta(int $page, int $perPage, int $totalItems): array
    {
        $totalPages = max(1, (int) ceil($totalItems / $perPage));
        return [
            'pagination' => [
                'page' => $page,
                'perPage' => $perPage,
                'totalItems' => $totalItems,
                'totalPages' => $totalPages,
            ],
        ];
    }
}
