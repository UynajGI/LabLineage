import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FileText, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { ProjectSummary } from '../types';

interface DashboardProps {
  summary: ProjectSummary;
}

const getScoreColor = (score: string) => {
  switch (score) {
    case 'R4': return '#22c55e'; // green
    case 'R3': return '#84cc16'; // lime
    case 'R2': return '#eab308'; // yellow
    case 'R1': return '#f97316'; // orange
    case 'R0': return '#ef4444'; // red
    default: return '#cbd5e1';
  }
};

export const Dashboard: React.FC<DashboardProps> = ({ summary }) => {
  const chartData = Object.entries(summary.reproducibilityScores).map(([level, count]) => ({
    name: level,
    count
  })).reverse(); // R4 to R0
  const readiness = Math.max(0, Math.min(100, 100 - summary.openFindings * 15));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Project Overview: {summary.name}</h1>
        <span className="text-sm text-slate-500">Last scanned: {new Date(summary.lastScan).toLocaleString()}</span>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
            <FileText size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Assets</p>
            <p className="text-2xl font-bold text-slate-800">{summary.totalAssets}</p>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-full">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">R4 (Verified)</p>
            <p className="text-2xl font-bold text-slate-800">{summary.reproducibilityScores['R4']}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-yellow-100 text-yellow-600 rounded-full">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">R2 (Traceable)</p>
            <p className="text-2xl font-bold text-slate-800">{summary.reproducibilityScores['R2']}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-red-100 text-red-600 rounded-full">
            <AlertTriangle size={24} />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Open Findings</p>
            <p className="text-2xl font-bold text-slate-800">{summary.openFindings}</p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Reproducibility Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" />
                <Tooltip cursor={{fill: '#f1f5f9'}} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getScoreColor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2 text-center">
            R4: Verified | R3: Runnable | R2: Traceable | R1: Locatable | R0: Unknown
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Handoff Readiness</h2>
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
             <div className="relative w-32 h-32">
                <svg className="w-full h-full" viewBox="0 0 36 36">
                  <path
                    className="text-slate-200"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="text-blue-500"
                    strokeDasharray={`${readiness}, 100`}
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-2xl font-bold text-slate-800">{readiness}%</span>
                </div>
             </div>
             <p className="text-sm text-slate-600 text-center max-w-xs">
               Handoff readiness has <span className="font-bold text-red-700">{summary.openFindings} open findings</span>. Resolve P0 and P1 issues to proceed.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};
