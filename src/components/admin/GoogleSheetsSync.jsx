'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, ExternalLink, RefreshCw, Link, Pencil, Check } from "lucide-react";
import { toast } from 'sonner';

const SPREADSHEET_ID = '1r-kIS4b4xmxNUz68Vmzd7WL5u3F7vumQ53_9mvQ-_cw';

export default function GoogleSheetsSync() {
  const [syncing, setSyncing] = useState(false);
  const [handicapUrl, setHandicapUrl] = useState('');
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    api.entities.AppSettings.filter({ setting_key: 'handicap_sheet_url' }).then(records => {
      if (records.length > 0) setHandicapUrl(records[0].setting_value);
    }).catch(() => {});
  }, []);

  const handleSaveUrl = async () => {
    setSavingUrl(true);
    try {
      const records = await api.entities.AppSettings.filter({ setting_key: 'handicap_sheet_url' });
      if (records.length > 0) {
        await api.entities.AppSettings.update(records[0].id, { setting_value: urlInput });
      } else {
        await api.entities.AppSettings.create({ setting_key: 'handicap_sheet_url', setting_value: urlInput, description: 'Link to the handicap Google Sheet' });
      }
      setHandicapUrl(urlInput);
      setEditingUrl(false);
      toast.success('Handicap sheet link updated successfully!');
    } catch (err) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSavingUrl(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.functions.invoke('autoSyncAvailability', {});
      toast.success(res.data?.message || 'Sheet synced successfully');
    } catch (err) {
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          Google Sheet
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleSync}
          disabled={syncing}
          className="bg-emerald-700 hover:bg-emerald-800 text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync Availability to Sheet'}
        </Button>
        <Button
          onClick={() => window.open(handicapUrl || `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`, '_blank')}
          variant="outline"
          className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Sheet
        </Button>
      </div>

      {/* Handicap Sheet Link */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-sm font-medium text-slate-600 mb-2 flex items-center gap-1">
          <Link className="h-4 w-4 text-emerald-600" /> Handicap Sheet
        </p>
        {editingUrl ? (
          <div className="flex gap-2 items-center">
            <Input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste Google Docs/Sheets link..."
              className="text-sm h-8 flex-1"
            />
            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSaveUrl} disabled={savingUrl}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingUrl(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {!handicapUrl && <span className="text-sm text-slate-400">No link set</span>}
            <Button variant="ghost" size="sm" className="h-8 text-slate-500" onClick={() => { setUrlInput(handicapUrl); setEditingUrl(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> {handicapUrl ? 'Update Link' : 'Set Link'}
            </Button>
          </div>
        )}
      </div>
      </CardContent>
    </Card>
  );
}