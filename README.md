<div align="center">
  <h1>🗺️ GeoLeads</h1>
  <p><strong>Enterprise-grade CLI tool for extracting business leads from Google Maps</strong></p>

  [![npm version](https://img.shields.io/npm/v/geoleads.svg?style=flat-square)](https://www.npmjs.com/package/geoleads)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-success?style=flat-square)](https://nodejs.org/)
</div>

<hr>

## 📖 Overview

**GeoLeads** is a powerful, highly-optimized command-line interface (CLI) designed for local and international lead generation. Built dynamically on top of Node.js and Puppeteer, it navigates Google Maps using advanced stealth techniques to effortlessly extract rich business data and export it directly into structured, ready-to-use Excel (`.xlsx`) files.

Whether you're building targeted B2B contact lists, auditing local competitors, or enriching a CRM, GeoLeads provides a robust pipeline that mitigates bot-detection while maximizing data yield.

---

## ✨ Features

- 🕵️ **Advanced Stealth Automation**: Utilizes `puppeteer-extra-plugin-stealth` with randomized User-Agent rotation and human-like delay heuristics to bypass basic bot-detection mechanisms.
- 🏢 **Deep Data Extraction**: Scrapes business names, addresses, phone numbers, and websites natively from Google Maps.
- 📧 **Intelligent Email Discovery**: Automatically crawls discovered business websites (scanning homepages, `/contact`, and `/about` pages) using heuristic regex matching to find valid email addresses.
- ⚡ **High-Performance Batch Processing**: Built-in multi-city sequential and parallel processing capabilities with worker pools to drastically reduce processing time on large datasets.
- 📊 **Enterprise Excel Exports**: Generates beautiful `.xlsx` files with structured columns, frozen headers, clickable hyperlinked cells (for emails and URLs), and automatic column width adjustment.
- 🔄 **Smart Deduplication**: Prevents duplicate entries based on business names inside processing batches.

---

## 🚀 Installation

GeoLeads requires **Node.js (v18 or higher)**. Installing it globally allows you to run the `geoleads` command from any terminal directory.

```bash
# Install globally via npm
npm install -g geoleads
```

*(Alternatively, you can clone the repository and run `npm link` to install it locally for development).*

---

## 💻 Usage & Workflows

GeoLeads provides an intuitive CLI. At its simplest, provide a search query and a limit.

### Basic Single-Query Scraping

Ideal for targeted, one-off searches.

```bash
geoleads "restaurants in Delhi" --limit=20 --output=delhi_restaurants.xlsx
```

### Visual Debugging (Headful Mode)

If you are experiencing timeouts or want to see the automation in real-time, enable `--headful` mode to watch the browser window.

```bash
geoleads "digital marketing agencies in London" --limit=10 --headful
```

---

### 🔥 Advanced: Multi-City Batch Mode

For large-scale lead generation, GeoLeads supports variables in your query. Create a text file containing city names (one per line) and use the `[city]` placeholder.

**`cities.txt`**
```text
Mumbai
Bangalore
Pune
```

**Command:**
```bash
geoleads "gym in [city]" --params=cities.txt --limit=50 --output=indian_gyms.xlsx
```

*This will systematically scrape 50 gyms from Mumbai, then 50 from Bangalore, etc., exporting the results into a single Excel workbook containing multiple colored tabs (one per city).*

---

### ⚡ Turbo: Fast Parallel Processing

Need data immediately at the risk of higher detection? Combine Batch Mode with `--concurrency`, `--fast`, and `--skip-emails`.

```bash
geoleads "cafes in [city]" -p cities.txt -l 20 -c 3 --fast --skip-emails -o cafes.xlsx
```

- `-c 3` runs 3 headless browsers simultaneously.
- `--fast` cuts the human-like delay times by 75%.
- `--skip-emails` stops the scraper from visiting individual business websites, saving massive amounts of time.

> [!CAUTION]
> Utilizing high concurrency combined with `--fast` drastically increases the likelihood of triggering Google's CAPTCHAs or temporary IP bans. Use responsibly and preferably behind a rotating proxy.

---

## 🛠️ Command Line Reference

| Flag | Alias | Default | Description |
| :--- | :---: | :---: | :--- |
| `query` | | (Required) | The search query (e.g. `"plumbers in Chicago"` or `"IT companies in [city]"`) |
| `--limit` | `-l` | `10` | Maximum number of business listings to retrieve per query. |
| `--output`| `-o` | `results.xlsx`| The destination path and filename for the `.xlsx` export. |
| `--headful`| | `false` | Disables headless mode, opening a visible Chrome window. |
| `--params`| `-p` | `undefined` | Path to a `.txt` file containing cities (requires `[city]` in query). |
| `--concurrency`| `-c`| `1` | Number of simultaneous browsers for batch mode (Max 10). |
| `--fast` | | `false` | Reduces built-in delays by 75% for rapid execution. |
| `--skip-emails`| | `false` | Bypasses navigating to individual websites to locate emails. |
| `--help` | `-h` | | Displays the help menu and examples. |

---

## 🏗️ Architecture

For contributors and developers, GeoLeads is organized into highly modularized, single-responsibility layers:

```text
GeoLeads/
├── cli/                 # Argument parsing and validation (yargs)
├── scraper/             # Core Puppeteer stealth maps navigation logic
├── parser/              # HTML DOM parsing, heuristic regex matchers, deduplication
├── exporter/            # ExcelJS generation, stylings, and multi-sheet routing
├── utils/               # Timing, standardized colored logging (Chalk/Ora), validators
└── index.ts             # CLI Command Orchestrator / Entry point
```

> [!IMPORTANT]
> **Extensibility**: The extraction logic in `parser/` is completely decoupled from the rendering in `scraper/`. If you wish to adapt GeoLeads to support an external API (like SerpApi or Apify), you only need to swap the `mapsScraper.ts` module.

---

## ⚖️ Disclaimer & Terms of Setup

> [!WARNING]
> While GeoLeads utilizes stealth plugins, scraping Google Services violates their Terms of Service. This tool is provided for **educational and academic research purposes only**. 
> 
> The authors and contributors assume no liability for misuse, IP bans, or resulting damage. Users must respect website `robots.txt` policies and adhere to local privacy regulations (e.g., GDPR, CCPA) when processing collected PII (Personally Identifiable Information) such as emails and phone numbers.

---

## 🤝 Contributing

We welcome contributions from the open-source community! 
If you have ideas for new features, bug fixes, or enhancements:

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'feat: add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  <i>Built with ❤️ by Naseem Ansari.</i>
</p>
