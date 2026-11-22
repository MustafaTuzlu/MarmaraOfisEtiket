<?php
header('X-Robots-Tag: noindex, follow');
// Basit site içi arama: sayfa başlıklarında / açıklamalarında arar.
$lang = $_GET['lang'] ?? 'tr';
if (!in_array($lang, ['tr', 'en', 'de'], true)) { $lang = 'tr'; }
$q = trim((string)($_GET['q'] ?? ''));
$q = mb_substr($q, 0, 80, 'UTF-8');

$L = [
  'tr' => ['title' => 'Arama', 'res' => 'Arama sonuçları', 'none' => 'Sonuç bulunamadı.', 'home' => './', 'ph' => 'Ne aramıştınız?', 'home_t' => 'Anasayfa'],
  'en' => ['title' => 'Search', 'res' => 'Search results', 'none' => 'No results found.', 'home' => 'en.html', 'ph' => 'What are you looking for?', 'home_t' => 'Home'],
  'de' => ['title' => 'Suche', 'res' => 'Suchergebnisse', 'none' => 'Keine Ergebnisse gefunden.', 'home' => 'de.html', 'ph' => 'Wonach suchen Sie?', 'home_t' => 'Startseite'],
][$lang];

function norm($s) { return mb_strtolower(strtr($s, ['İ' => 'i', 'I' => 'i', 'ı' => 'i']), 'UTF-8'); }

$results = [];
if ($q !== '') {
    $nq = norm($q);
    $base = __DIR__ . '/' . $lang;
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        if ($f->getExtension() !== 'html') continue;
        $html = file_get_contents($f->getPathname());
        if (!preg_match('~<title>\s*(.*?)\s*</title>~is', $html, $m)) continue;
        $title = trim(html_entity_decode(preg_replace('/\s+/', ' ', $m[1]), ENT_QUOTES, 'UTF-8'));
        $desc = preg_match('~<meta name="description" content="([^"]*)"~i', $html, $d) ? html_entity_decode($d[1], ENT_QUOTES, 'UTF-8') : '';
        $hit = mb_strpos(norm($title), $nq) !== false ? 2 : (mb_strpos(norm($desc), $nq) !== false ? 1 : 0);
        if ($hit && basename($f->getFilename()) !== $lang . '.html') {
            $rel = substr($f->getPathname(), strlen(__DIR__) + 1);
            $results[] = ['score' => $hit, 'title' => $title, 'url' => str_replace(DIRECTORY_SEPARATOR, '/', $rel)];
        }
    }
    usort($results, fn($a, $b) => [$b['score'], $a['title']] <=> [$a['score'], $b['title']]);
}
$e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!DOCTYPE html>
<html lang="<?= $e($lang) ?>">
<head>
<meta charset="UTF-8" />
<title><?= $e($L['title']) ?> | Marmara Ofis</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<link rel="stylesheet" href="css/style.css" />
<link rel="stylesheet" href="css/responsive.css" />
<link rel="stylesheet" href="css/color-themes/yellow-theme.css" />
<link rel="shortcut icon" href="Upload/favicon.png" />
</head>
<body>
<div class="container" style="padding:40px 15px;max-width:800px">
  <p><a href="<?= $e($L['home']) ?>"><?= $e($L['home_t']) ?></a></p>
  <h2><?= $e($L['res']) ?></h2>
  <form action="arama.php" method="get" style="margin:20px 0">
    <input type="hidden" name="lang" value="<?= $e($lang) ?>" />
    <input type="search" name="q" value="<?= $e($q) ?>" placeholder="<?= $e($L['ph']) ?>" style="width:100%;padding:10px;border:1px solid #ccc" required />
  </form>
  <?php if ($q !== ''): if (!$results): ?>
    <p><?= $e($L['none']) ?></p>
  <?php else: ?>
    <ul style="list-style:none;padding:0">
    <?php foreach ($results as $r): ?>
      <li style="padding:8px 0;border-bottom:1px solid #eee"><a href="<?= $e($r['url']) ?>"><?= $e($r['title']) ?></a></li>
    <?php endforeach; ?>
    </ul>
  <?php endif; endif; ?>
</div>
</body>
</html>
