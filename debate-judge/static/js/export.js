/**
 * export.js — Export debate data in various formats
 */
const Export = {
    downloadTxt() {
        window.location.href = "/api/export/txt";
    },

    downloadMarkdown() {
        window.location.href = "/api/export/md";
    },

    downloadJson() {
        window.location.href = "/api/export/json";
    },
};
