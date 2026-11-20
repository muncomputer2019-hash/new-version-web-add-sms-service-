<?php
declare(strict_types=1);

namespace MunComputer\Controllers;

use MunComputer\Services\ResponseService;
use MunComputer\Services\SearchService;
use PDO;

class SearchController
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function handle(array $query): void
    {
        $q = trim((string) ($query['q'] ?? ''));
        if (strlen($q) < 2) {
            ResponseService::error('Search query must be at least 2 characters.', 422, [
                'q' => ['Minimum length is 2 characters.'],
            ]);
            return;
        }

        $service = new SearchService($this->db);
        $results = $service->globalSearch($q);
        ResponseService::success($results, 'Global search results.');
    }
}
