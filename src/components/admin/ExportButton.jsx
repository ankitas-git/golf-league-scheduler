'use client';

import React from 'react';
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet } from "lucide-react";
import { format, parseISO } from "date-fns";
import * as XLSX from 'xlsx';

export default function ExportButton({ data, filename = "availability-export" }) {
  const headers = ['Date', 'Player Name', 'Player Email', 'Start Time', 'End Time', 'Notes'];
  
  const getRows = () => {
    if (!data || data.length === 0) return [];
    return data.map(item => [
      format(parseISO(item.date), 'yyyy-MM-dd'),
      item.player_name || '',
      item.player_email || '',
      item.start_time || '',
      item.end_time || '',
      item.notes || ''
    ]);
  };

  const exportToCSV = () => {
    const rows = getRows();
    if (rows.length === 0) return;

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcel = () => {
    const rows = getRows();
    if (rows.length === 0) return;

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Availability');
    
    XLSX.writeFile(workbook, `${filename}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={exportToCSV}
        disabled={!data || data.length === 0}
        variant="outline"
        className="h-10 px-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
      >
        <Download className="w-4 h-4 mr-2" />
        Export CSV
      </Button>
      <Button
        onClick={exportToExcel}
        disabled={!data || data.length === 0}
        className="h-10 px-4 bg-emerald-700 hover:bg-emerald-800 text-white"
      >
        <FileSpreadsheet className="w-4 h-4 mr-2" />
        Export Excel
      </Button>
    </div>
  );
}