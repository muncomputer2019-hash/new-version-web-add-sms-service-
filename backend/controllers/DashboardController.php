<?php
declare(strict_types=1);

namespace MunComputer\Controllers;

use MunComputer\Models\Application;
use MunComputer\Services\PaginationService;
use MunComputer\Services\ResponseService;
use PDO;

class DashboardController
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function summary(): void
    {
        $totalCustomers = (int) $this->db->query("SELECT COUNT(*) FROM customers")->fetchColumn();
        $activeApplications = (int) $this->db->query(
            "SELECT COUNT(*) FROM applications WHERE status IN ('Pending', 'Processing')"
        )->fetchColumn();
        $pendingApplications = (int) $this->db->query(
            "SELECT COUNT(*) FROM applications WHERE status = 'Pending'"
        )->fetchColumn();
        $todaysCollection = (float) $this->db->query(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE DATE(recorded_at) = CURDATE() AND status = 'Paid'"
        )->fetchColumn();

        ResponseService::success([
            'totalCustomers' => $totalCustomers,
            'activeApplications' => $activeApplications,
            'todaysCollection' => $todaysCollection,
            'pendingApplications' => $pendingApplications,
        ], 'Dashboard summary loaded.');
    }

    public function recentApplications(array $query): void
    {
        $paging = PaginationService::parseParams($query, 5);
        $model = new Application($this->db);
        $items = $model->listPaginated($paging['per_page'], $paging['offset'], $query['status'] ?? null);
        $total = $model->countAll();

        ResponseService::success(
            $items,
            'Recent applications fetched.',
            200,
            PaginationService::buildMeta($paging['page'], $paging['per_page'], $total)
        );
    }
}
