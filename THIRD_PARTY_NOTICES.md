# Third-party notices

このサイトには以下の第三者ソフトウェアおよびフォントが含まれています。本書は使用物と権利表示の所在を案内するもので、各配布元のライセンス文を置き換えるものではありません。ライセンス文および配布物内の著作権・ライセンス表示は、そのまま保持してください。

## jsPDF

- Version: 4.2.1
- Project: https://github.com/parallax/jsPDF
- Distribution: `vendor/jspdf.umd.min.js`
- License: MIT
- License text: `vendor/LICENSE.jspdf.txt`

jsPDFバンドル内には、依存コードの著作権・ライセンスコメントも含まれています。本体のMITライセンスとは別に、これらの表示も保持してください。

内包されるpako 2.1.0（https://github.com/nodeca/pako）は、MITおよびZlibライセンスのコードを含みます。バンドル内の短いライセンス表示を補うため、以下の文書を同梱しています。

- pakoのMITライセンス：`vendor/LICENSE.txt`
- MIT原文の参照先：https://raw.githubusercontent.com/nodeca/pako/2.1.0/LICENSE
- zlib由来部分の著作権・ライセンスを含む公式README：`vendor/LICENSE.pako-zlib.txt`
- READMEのダウンロード元：https://raw.githubusercontent.com/nodeca/pako/2.1.0/lib/zlib/README

`vendor/LICENSE.pako-zlib.txt` は、上記README全体を2026-09-06にダウンロードして保存したものです。保存名のみ変更し、本文の抜粋・追記・置換・改行の変更はしていません。原文中のプレースホルダー表記もそのまま保持しています。

## M PLUS 1p

- Style: Regular
- Project: https://github.com/googlefonts/MPLUS_1P
- Font file: `fonts/MPLUS1p-Regular.ttf`
- License: SIL Open Font License 1.1
- License text: `fonts/OFL.txt`

PDFへフォントを埋め込んで生成された文書そのものに、SIL Open Font Licenseを適用する必要はありません。フォントファイルを再配布する場合は、同梱したライセンスの条件に従ってください。

## KaTeX

- Version: 0.18.5
- Project: https://github.com/KaTeX/KaTeX
- 本体：`katex/katex.min.js`, `katex/katex.min.css`
- 本体のライセンス：MIT
- 本体のライセンス文：`katex/LICENSE.txt`
- 同梱フォント：`katex/fonts/`（TTF・WOFF・WOFF2）

KaTeX本体のMITライセンスと、フォントの内部情報に記載されたライセンスは区別します。同梱TTFのnameテーブルには、SIL Open Font License 1.1の適用、以下の著作権者、予約フォント名およびOFLへの参照URLが記録されています。

- Copyright (c) 2009-2010 Design Science, Inc.
- Copyright (c) 2014-2018 Khan Academy
- 内部情報にあるOFL参照URL：http://scripts.sil.org/OFL
- 現在のOFL公式サイト：https://openfontlicense.org/
- OFL公式本文：https://openfontlicense.org/open-font-license-official-text/

予約フォント名は各フォントの内部情報を参照してください。例えば `KaTeX_Main-Regular.ttf` には `KaTeX_Main` が記載されています。フォント本体および内部の著作権・ライセンス情報は変更していません。

KaTeXの当該配布物に対応する独立したフォント用OFLファイルは確認できていないため、`katex/OFL.txt` は同梱していません。OFL公式FAQ 1.10は、フォント内部のメタデータにライセンス本文へのリンクを含める方法も認めています（全文の同梱を推奨）。参照：https://openfontlicense.org/ofl-faq/

未使用の `katex/contrib/` は配布対象から除外しています。Apache-2.0の表示を含むmhchem拡張も同梱していません。

## html-to-image

- Version: 1.11.13
- Project: https://github.com/bubkoo/html-to-image
- Distribution: `vendor/html-to-image.js`
- License: MIT
- License text: `vendor/LICENSE.html-to-image.txt`
- JS配布元：https://unpkg.com/html-to-image@1.11.13/dist/html-to-image.js
- ライセンス原文：https://raw.githubusercontent.com/bubkoo/html-to-image/v1.11.13/LICENSE

画像付きZIPの問題・解答PNGの作成に使用します。利用者がダウンロードしたJSと公式ソース配布物内のLICENSEをコピーし、内容は変更していません。

## fflate

- Version: 0.8.3
- Project: https://github.com/101arrowz/fflate
- Distribution: `vendor/fflate.js`
- License: MIT
- License text: `vendor/LICENSE.fflate.txt`
- JS配布元：https://unpkg.com/fflate@0.8.3/umd/index.js
- ライセンス原文：https://raw.githubusercontent.com/101arrowz/fflate/v0.8.3/LICENSE

CSVとPNGをZIPに格納する処理に使用します。利用者がダウンロードした `index.js` を `fflate.js` の名前でコピーし、公式ソース配布物内のLICENSEも同梱しています。両ファイルの内容は変更していません。
