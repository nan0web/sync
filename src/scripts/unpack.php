<?php
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(120);
ini_set('memory_limit', '256M');
header('Content-Type: application/json');

$prefix = '__ARCHIVE_PREFIX__';
$chunk = isset($_GET['chunk']) ? (int)$_GET['chunk'] : 0;
$total = isset($_GET['total']) ? (int)$_GET['total'] : 1;

$archive = __DIR__ . '/' . $prefix . '_' . $chunk . '.tar.gz';
if (!file_exists($archive)) {
    echo json_encode(['ok' => false, 'error' => "Chunk $chunk not found", 'path' => $archive]);
    exit;
}

try {
    $phar = new PharData($archive);
    $phar->extractTo(__DIR__, null, true);
    $count = $phar->count();
    @unlink($archive);

    // Self-delete on last chunk
    if ($chunk >= $total - 1) {
        @unlink(__FILE__);
    }

    echo json_encode(['ok' => true, 'chunk' => $chunk, 'files' => $count]);
} catch (Exception $e) {
    echo json_encode(['ok' => false, 'chunk' => $chunk, 'error' => $e->getMessage()]);
}
