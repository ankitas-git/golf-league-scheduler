'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPageUrl } from '@/utils';
import { api } from '@/api/client';
import { Calendar, ShieldCheck, User, LogOut, Trash2, ChevronLeft } from 'lucide-react';
import DeleteAccountDialog from '@/components/DeleteAccountDialog';
import AccountDialog from '@/components/AccountDialog';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import useSettings from '@/hooks/useSettings';

// The page's server component already checked the session, so user is always set here.
export default function Layout({ children, currentPageName, user }) {
  const router = useRouter();

  const isRootPage = currentPageName === 'PlayerDashboard';
  const showBackButton = !isRootPage;

  const isAdmin = user?.role === 'admin';
  const { league_name } = useSettings();

  const navItems = [
    {
      name: 'League Calendar',
      page: 'PlayerDashboard',
      icon: Calendar,
      show: true
    },
    {
      name: 'Admin Dashboard',
      page: 'ManagerDashboard',
      icon: ShieldCheck,
      show: isAdmin
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Back button (mobile, non-root pages) */}
            {showBackButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.back()}
                className="md:hidden text-gray-600 hover:text-gray-900 select-none"
                title="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}

            {/* Logo */}
            <Link 
              href={createPageUrl('PlayerDashboard')}
              className="flex items-center gap-2"
            >
              <img 
                src="/oh-shield.png" 
                alt="OH Shield Logo" 
                className="w-9 h-9 object-contain"
              />
              <span className="font-bold text-gray-900 hidden sm:block">{league_name} Scheduler</span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.filter(item => item.show).map((item) => (
                <Link
                  key={item.page}
                  href={createPageUrl(item.page)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    currentPageName === item.page 
                      ? "bg-emerald-50 text-emerald-700" 
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </Link>
              ))}
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-3">
              {user && (
                <AccountDialog user={user}>
                  <button
                    type="button"
                    className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg"
                    title="Account settings"
                  >
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <span className="text-sm text-gray-600">{user.full_name}</span>
                    {isAdmin && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                        Admin
                      </span>
                    )}
                  </button>
                </AccountDialog>
              )}

              {user && (
                <>
                  <AccountDialog user={user}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="sm:hidden text-gray-400 hover:text-gray-600 select-none"
                      title="Account settings"
                    >
                      <User className="w-4 h-4" />
                    </Button>
                  </AccountDialog>
                  <DeleteAccountDialog>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-gray-400 hover:text-red-600 select-none"
                      title="Delete account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </DeleteAccountDialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => api.auth.logout()}
                    className="text-gray-400 hover:text-gray-600 select-none"
                    title="Log out"
                  >
                    <LogOut className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div 
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around h-16">
          {navItems.filter(item => item.show).map((item) => (
            <Link
              key={item.page}
              href={createPageUrl(item.page)}
              onClick={(e) => {
                // If tapping the already-active tab, reset to root view via replace
                if (currentPageName === item.page) {
                  e.preventDefault();
                  router.replace(createPageUrl(item.page));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-6 py-2 select-none",
                currentPageName === item.page 
                  ? "text-emerald-600" 
                  : "text-gray-500"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.name}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Page Content */}
      <main className="pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}