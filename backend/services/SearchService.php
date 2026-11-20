<?php
declare(strict_types=1);

namespace MunComputer\Services;

use PDO;

class SearchService
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function globalSearch(string $query, int $limit = 10): array
    {
        $like = '%' . trim($query) . '%';

        $stmtApps = $this->db->prepare(
            "SELECT id, application_no AS code, status FROM applications
             WHERE application_no LIKE :q LIMIT :lim"
        );
        $stmtApps->bindValue(':q', $like, PDO::PARAM_STR);
        $stmtApps->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmtApps->execute();

        $stmtCustomers = $this->db->prepare(
            "SELECT id, customer_code AS code, full_name, phone FROM customers
             WHERE full_name LIKE :q OR customer_code LIKE :q OR phone LIKE :q LIMIT :lim"
        );
        $stmtCustomers->bindValue(':q', $like, PDO::PARAM_STR);
        $stmtCustomers->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmtCustomers->execute();

        return [
            'applications' => $stmtApps->fetchAll(),
            'customers' => $stmtCustomers->fetchAll(),
        ];
    }
}
