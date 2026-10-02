'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TreePine, Download, Users, CalendarDays, Clock, FileSpreadsheet } from "lucide-react";
import { format, parseISO, isWithinInterval, startOfToday } from "date-fns";
import * as XLSX from 'xlsx';
import DateFilter from "@/components/DateFilter";
import GoogleSheetsSync from "@/components/admin/GoogleSheetsSync";
import TeeTimeSummary from "@/components/admin/TeeTimeSummary";
import ManagerCalendar from "@/components/admin/ManagerCalendar";
import AdminAvailabilityEditor from "@/components/admin/AdminAvailabilityEditor";
import GeneratePairings from "@/components/admin/GeneratePairings";
import TeeTimeEditor from "@/components/admin/TeeTimeEditor";
import SettingsPanel from "@/components/admin/SettingsPanel";
import AccountsPanel from "@/components/admin/AccountsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageTransition from '@/components/PageTransition';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import usePullToRefresh from '@/hooks/usePullToRefresh';

// The page checks for an admin session before this renders.
export default function ManagerDashboard({ user }) {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  const { data: availabilities = [], isLoading } = useQuery({
    queryKey: ['all-availability'],
    queryFn: () => api.entities.Availability.list('date'),
    enabled: !!user,
  });

  // Real-time updates
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = api.entities.Availability.subscribe((event) => {
      api.entities.Availability.list('date').then(data => {
        queryClient.setQueryData(['all-availability'], data);
      });
    });
    
    return unsubscribe;
  }, [user]);

  const { data: teeTimes = [] } = useQuery({
    queryKey: ['tee-times'],
    queryFn: () => api.entities.TeeTime.list('date'),
    enabled: !!user,
  });

  const { data: handicapMap = {} } = useQuery({
    queryKey: ['handicap-map'],
    queryFn: () => api.functions.invoke('getHandicaps', {}).then(r => r.data?.handicapMap || {}),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });



  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['all-availability'] });
    await queryClient.invalidateQueries({ queryKey: ['tee-times'] });
    await queryClient.invalidateQueries({ queryKey: ['handicap-map'] });
  };

  const ptr = usePullToRefresh(handleRefresh);

  const deleteTeeTimeMutation = useMutation({
    mutationFn: (id) => api.entities.TeeTime.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tee-times'] });
    },
  });



  // Filter availabilities based on date range
  const filteredAvailabilities = availabilities.filter(a => {
    const date = parseISO(a.date);
    
    // Only show today and future
    if (date < startOfToday()) return false;
    
    if (startDate && endDate) {
      return isWithinInterval(date, { start: startDate, end: endDate });
    }
    if (startDate) {
      return date >= startDate;
    }
    if (endDate) {
      return date <= endDate;
    }
    return true;
  });

  // Stats
  const uniquePlayers = new Set(filteredAvailabilities.map(a => a.player_email)).size;
  const uniqueDates = new Set(filteredAvailabilities.map(a => a.date)).size;

  // Check if pairing person accepted for that date
  const isPairingAvailable = (dateStr, pairingName) => {
    if (!pairingName) return false;
    const pairingLower = pairingName.toLowerCase();
    return availabilities.some(a => 
      a.date === dateStr && a.player_name?.toLowerCase().includes(pairingLower)
    );
  };

  // Export to CSV with single Availability column
  const exportToCSV = () => {
    const headers = ['PAIRINGS', 'DATE', 'TIMES', 'COURSE', 'AVAILABILITY - YES/NO'];
    
    const rows = teeTimes
      .filter(t => !t.notes?.includes('CLOSED'))
      .map(teeTime => {
        const dateStr = teeTime.date;
        const formattedDate = format(parseISO(dateStr), 'M/d');
        const timeRange = teeTime.start_time 
          ? `${teeTime.start_time}${teeTime.end_time ? ' - ' + teeTime.end_time : ''}`
          : '';
        
        const available = isPairingAvailable(dateStr, teeTime.pairing) ? 'Yes' : 'No';

        return [
          teeTime.pairing || '',
          formattedDate,
          timeRange,
          teeTime.course || '',
          available
        ];
      });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `golf-tee-times-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  // Export to Excel
  const exportToExcel = () => {
    const headers = ['PAIRINGS', 'DATE', 'TIMES', 'COURSE', 'AVAILABILITY - YES/NO'];
    
    const rows = teeTimes
      .filter(t => !t.notes?.includes('CLOSED'))
      .map(teeTime => {
        const dateStr = teeTime.date;
        const formattedDate = format(parseISO(dateStr), 'M/d');
        const timeRange = teeTime.start_time 
          ? `${teeTime.start_time}${teeTime.end_time ? ' - ' + teeTime.end_time : ''}`
          : '';
        
        const available = isPairingAvailable(dateStr, teeTime.pairing) ? 'Yes' : 'No';

        return [
          teeTime.pairing || '',
          formattedDate,
          timeRange,
          teeTime.course || '',
          available
        ];
      });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tee Times');
    
    XLSX.writeFile(workbook, `golf-tee-times-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };



  return (
    <PageTransition>
    <div
      ref={ptr.scrollRef}
      onTouchStart={ptr.onTouchStart}
      onTouchMove={ptr.onTouchMove}
      onTouchEnd={ptr.onTouchEnd}
      className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30"
      style={{ overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center">
                <TreePine className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Manager Dashboard</h1>
                <p className="text-sm text-slate-500">Golf Availability Overview</p>
              </div>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 border-0 font-medium">
              Admin
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PullToRefreshIndicator pullDistance={ptr.pullDistance} refreshing={ptr.refreshing} threshold={ptr.THRESHOLD} />
        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4 mb-8">
          <Card className="border-0 shadow-lg shadow-slate-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Available Players</p>
                  <p className="text-2xl font-bold text-slate-900">{uniquePlayers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg shadow-slate-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CalendarDays className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Dates with Availability</p>
                  <p className="text-2xl font-bold text-slate-900">{uniqueDates}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg shadow-slate-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Total Entries</p>
                  <p className="text-2xl font-bold text-slate-900">{filteredAvailabilities.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Google Sheets Sync */}
        <GoogleSheetsSync />

        {/* Generate Pairings */}
        <div className="my-8">
          <GeneratePairings teeTimes={teeTimes} />
        </div>

        {/* Tee Time Signup Summary */}
        <div className="my-8">
          <TeeTimeSummary teeTimes={teeTimes} availabilities={availabilities} handicapMap={handicapMap} />
        </div>

        {/* Filters and Export */}
        <Card className="border-0 shadow-lg shadow-slate-200/50 my-8">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <DateFilter
                startDate={startDate}
                endDate={endDate}
                onStartChange={setStartDate}
                onEndChange={setEndDate}
                onClear={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
              />
              
              <div className="flex gap-2">
                <Button
                  onClick={exportToCSV}
                  disabled={teeTimes.length === 0}
                  variant="outline"
                  className="border-emerald-700 text-emerald-700 hover:bg-emerald-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  onClick={exportToExcel}
                  disabled={teeTimes.length === 0}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white shadow-lg shadow-emerald-700/20"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* View Toggle */}
        <Tabs defaultValue="calendar" className="w-full">
          <TabsList className="grid w-full max-w-3xl mx-auto grid-cols-2 sm:grid-cols-5 h-auto">
            <TabsTrigger value="calendar">Calendar View</TabsTrigger>
            <TabsTrigger value="table">Edit Player Availability</TabsTrigger>
            <TabsTrigger value="teetimes">Tee Times</TabsTrigger>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="calendar" className="mt-6">
            <ManagerCalendar
              teeTimes={teeTimes}
              availabilities={filteredAvailabilities}
              onDeleteTeeTime={(id) => deleteTeeTimeMutation.mutate(id)}
            />
          </TabsContent>
          
          <TabsContent value="table" className="mt-6">
            <p className="text-sm text-slate-500 mb-4">Click any cell to toggle a player's availability for a tee time date.</p>
            <AdminAvailabilityEditor
              teeTimes={teeTimes}
              availabilities={availabilities}
            />
          </TabsContent>

          <TabsContent value="teetimes" className="mt-6">
            <TeeTimeEditor />
          </TabsContent>

          <TabsContent value="accounts" className="mt-6">
            <AccountsPanel />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <SettingsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
    </PageTransition>
  );
}