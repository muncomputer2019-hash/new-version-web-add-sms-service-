<?php
declare(strict_types=1);

namespace MunComputer\Services;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Throwable;

/**
 * Financial-Year Document Serial Generator (April to March, Asia/Kolkata)
 * Examples:
 *   MCR-2026-27-000001
 *   MCI-2026-27-000001
 *   MCA-2026-27-000001
 */
class DocumentSequenceService
{
    public const PREFIXES = [
        'RECEIPT' => 'MCR',
        'INVOICE' => 'MCI',
        'APPLICATION' => 'MCA',
    ];

    public function __construct(private readonly PDO $db)
    {
    }

    public static function currentFinancialYear(string $tz = 'Asia/Kolkata'): string
    {
        $now = new DateTimeImmutable('now', new DateTimeZone($tz));
        $year = (int) $now->format('Y');
        $month = (int) $now->format('n');
        $startYear = $month >= 4 ? $year : $year - 1;
        $endYearShort = substr((string) ($startYear + 1), -2);
        return sprintf('%d-%s', $startYear, $endYearShort);
    }

    public function allocateNext(string $docType): string
    {
        $type = strtoupper(trim($docType));
        if (!isset(self::PREFIXES[$type])) {
            throw new \InvalidArgumentException("Unsupported document type: {$docType}");
        }

        $prefix = self::PREFIXES[$type];
        $fy = self::currentFinancialYear();

        $startedTx = !$this->db->inTransaction();
        if ($startedTx) {
            $this->db->beginTransaction();
        }

        try {
            $stmt = $this->db->prepare(
                "SELECT id, last_serial FROM document_sequences
                 WHERE doc_type = :dt AND financial_year = :fy
                 FOR UPDATE"
            );
            $stmt->execute([':dt' => $type, ':fy' => $fy]);
            $row = $stmt->fetch();

            if (!$row) {
                $next = 1;
                $ins = $this->db->prepare(
                    "INSERT INTO document_sequences (doc_type, prefix, financial_year, last_serial, status)
                     VALUES (:dt, :pref, :fy, :ser, 'active')"
                );
                $ins->execute([':dt' => $type, ':pref' => $prefix, ':fy' => $fy, ':ser' => $next]);
            } else {
                $next = ((int) $row['last_serial']) + 1;
                $upd = $this->db->prepare("UPDATE document_sequences SET last_serial = :ser WHERE id = :id");
                $upd->execute([':ser' => $next, ':id' => $row['id']]);
            }

            if ($startedTx) {
                $this->db->commit();
            }

            return sprintf('%s-%s-%06d', $prefix, $fy, $next);
        } catch (Throwable $e) {
            if ($startedTx && $this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }
}
