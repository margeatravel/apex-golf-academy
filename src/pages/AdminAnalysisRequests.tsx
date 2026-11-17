import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAssignedStudentIds } from '@/hooks/useAssignedStudentIds';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, BarChart3, Play, User, Calendar, Eye, AlertCircle, Clock, CheckCircle, DollarSign, XCircle, ArrowRightLeft, Trash2, Share2, Pencil, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { SocialFooter } from '@/components/SocialFooter';
import { VideoDetailModal } from '@/components/VideoDetailModal';
import { VideoCardMenu } from '@/components/VideoCardMenu';
import { ReassignVideoModal } from '@/components/ReassignVideoModal';
import { SignedMediaImg as SignedLessonImg, SignedMediaImg } from '@/components/SignedMedia';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AnalysisVideo {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string;
  upload_date: string;
  tags: string[] | null;
  student_id: string;
  thumbnail_url: string | null;
  coach_feedback: string | null;
  profiles?: { full_name: string | null; email: string } | null;
}

interface AnalysisRequest {
  id: string;
  student_id: string;
  video_id: string | null;
  payment_status: string;
  delivery_status: string;
  amount: number;
  created_at: string;
  notes: string | null;
  profiles?: { full_name: string | null; email: string } | null;
}

export default function AdminAnalysisRequests() {
  const { } = useAuth();
  const { isOwner, studentIds } = useAssignedStudentIds();
  const scopeKey = isOwner ? 'all' : `coach:${(studentIds ?? []).slice().sort().join(',')}`;
  const queryClient = useQueryClient();
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reassignVideo, setReassignVideo] = useState<AnalysisVideo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: analysisRequests = [] } = useQuery({
    queryKey: ['admin-analysis-requests-tracking', scopeKey],
    queryFn: async () => {
      if (!isOwner && (!studentIds || studentIds.length === 0)) return [];
      let q = supabase
        .from('analysis_requests')
        .select('*, profiles:student_id(full_name, email)')
        .order('created_at', { ascending: false });
      if (!isOwner && studentIds) q = q.in('student_id', studentIds);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return (data || []) as unknown as AnalysisRequest[];
    },
  });

  const { data: analysisVideos = [], isLoading } = useQuery({
    queryKey: ['admin-analysis-requests', scopeKey],
    queryFn: async () => {
      if (!isOwner && (!studentIds || studentIds.length === 0)) return [];
      let q = supabase
        .from('videos')
        .select('*, profiles(full_name, email)')
        .eq('category', 'analysis')
        .order('upload_date', { ascending: false });
      if (!isOwner && studentIds) q = q.in('student_id', studentIds);
      const { data, error } = await q;
      if (error) { console.error(error); return []; }
      return (data || []) as AnalysisVideo[];
    },
  });

  const handleOpenModal = (videoId: string) => { setSelectedVideoId(videoId); setIsModalOpen(true); };
  const handleCloseModal = () => { setIsModalOpen(false); setSelectedVideoId(null); };
  const handleFeedbackSaved = () => { queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests'] }); };

  // Selection logic
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === analysisVideos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(analysisVideos.map(v => v.id)));
    }
  };
  const clearSelection = () => setSelectedIds(new Set());
  const isSelecting = selectedIds.size > 0;

  // Bulk delete
  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('videos').delete().in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} video(s) deleted`);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests'] });
    } catch (err: any) {
      toast.error(err.message || 'Delete failed');
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  // Bulk share
  const handleBulkShare = () => {
    const selected = analysisVideos.filter(v => selectedIds.has(v.id));
    const urls = selected.map(v => v.file_url).join('\n');
    navigator.clipboard.writeText(urls);
    toast.success(`${selected.length} video link(s) copied to clipboard`);
  };

  // Bulk reassign — pick first selected to open reassign modal
  const handleBulkReassign = () => {
    // We'll use a special bulk reassign approach
    setBulkReassignOpen(true);
  };

  const paidRequests = analysisRequests.filter(r => r.payment_status === 'paid');
  const pendingRequests = analysisRequests.filter(r => r.payment_status === 'pending');

  return (
    <div className="app-bg min-h-screen">
      <header className="glass-header sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/admin">
            <Button variant="ghost" size="sm" className="hover:bg-secondary/60">
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="h-11 w-11 icon-container icon-container-primary">
              <BarChart3 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold text-foreground">Analysis Requests</h1>
              <p className="text-xs text-muted-foreground">Paid video analysis submissions from students</p>
            </div>
          </div>
        </div>
      </header>

      {/* Bulk action bar */}
      {isSelecting && (
        <div className="sticky top-[68px] z-10 border-b" style={{ background: 'rgba(74,124,89,0.15)', backdropFilter: 'blur(20px)', borderColor: 'rgba(255,255,255,0.1)' }}>
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={clearSelection} className="text-[#F5F0E8]/70 hover:text-[#F5F0E8] h-8 gap-1">
                <X className="h-4 w-4" /> Clear
              </Button>
              <span className="text-sm font-medium" style={{ color: '#F5F0E8' }}>
                {selectedIds.size} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleBulkReassign} className="btn-glass text-xs h-8 gap-1.5">
                <ArrowRightLeft className="h-3.5 w-3.5" /> Reassign
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (selectedIds.size === 1) {
                  handleOpenModal(Array.from(selectedIds)[0]);
                } else {
                  toast.info('Select a single video to edit details');
                }
              }} className="btn-glass text-xs h-8 gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkShare} className="btn-glass text-xs h-8 gap-1.5">
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(true)}
                className="text-xs h-8 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Summary stats */}
        {analysisRequests.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-card p-4 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-heading font-bold text-gold-accent">{analysisRequests.length}</p>
              <p className="text-xs text-ivory/50">Total Requests</p>
            </div>
            <div className="glass-card p-4 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-heading font-bold text-green-accent">{paidRequests.length}</p>
              <p className="text-xs text-ivory/50">Paid</p>
            </div>
            <div className="glass-card p-4 text-center" style={{ borderRadius: 16 }}>
              <p className="text-2xl font-heading font-bold text-ivory/60">{pendingRequests.length}</p>
              <p className="text-xs text-ivory/50">Pending</p>
            </div>
          </div>
        )}

        {/* Analysis requests list */}
        {analysisRequests.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-heading font-semibold text-ivory/70 uppercase tracking-wider">Payment Tracking</h2>
            {analysisRequests.map((req) => (
              <div key={req.id} className="glass-card p-4 flex items-center gap-4" style={{ borderRadius: 16 }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ivory truncate">
                    {(req.profiles as any)?.full_name || (req.profiles as any)?.email || 'Unknown'}
                  </p>
                  <p className="text-xs text-ivory/50">
                    {format(new Date(req.created_at), 'MMM dd, yyyy · h:mm a')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gold-accent">${req.amount} MXN</span>
                  {req.payment_status === 'paid' ? (
                    <Badge className="bg-green-accent/20 text-green-accent border-green-accent/30">
                      <CheckCircle className="h-3 w-3 mr-1" /> Paid
                    </Badge>
                  ) : req.payment_status === 'pending' ? (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <Clock className="h-3 w-3 mr-1" /> Pending
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                      <XCircle className="h-3 w-3 mr-1" /> Failed
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Analysis videos grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-heading font-semibold text-ivory/70 uppercase tracking-wider">Submitted Videos</h2>
            {analysisVideos.length > 0 && (
              <button onClick={toggleAll} className="text-xs font-medium transition-colors" style={{ color: selectedIds.size === analysisVideos.length ? '#F0C040' : 'rgba(245,240,232,0.5)' }}>
                {selectedIds.size === analysisVideos.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="card-elevated">
                  <div className="aspect-video bg-muted/40 animate-pulse" />
                  <CardContent className="p-5 space-y-3">
                    <div className="h-6 bg-muted/40 rounded animate-pulse" />
                    <div className="h-4 bg-muted/40 rounded w-2/3 animate-pulse" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : analysisVideos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {analysisVideos.map((video) => {
                const isSelected = selectedIds.has(video.id);
                return (
                  <Card key={video.id} className={`card-elevated overflow-hidden group border-l-4 transition-all ${isSelected ? 'border-l-[#F0C040] ring-2 ring-[#F0C040]/30' : 'border-l-destructive'}`}>
                    <div className="aspect-video bg-secondary/40 flex items-center justify-center relative overflow-hidden">
                      {/* Selection checkbox */}
                      <div className="absolute top-2 left-2 z-20">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelect(video.id); }}
                          className={`h-7 w-7 rounded-lg flex items-center justify-center border transition-all ${
                            isSelected ? 'bg-[#F0C040] border-[#F0C040]' : 'bg-black/50 border-white/30 hover:border-white/60'
                          }`}
                        >
                          {isSelected && <CheckCircle className="h-4 w-4 text-black" />}
                        </button>
                      </div>
                      <div className="absolute top-2 right-2 z-20">
                        <VideoCardMenu
                          video={{
                            id: video.id, title: video.title, description: video.description,
                            tags: video.tags, file_url: video.file_url, student_id: video.student_id,
                          }}
                        />
                      </div>
                      <div className="absolute top-10 left-2 z-10 flex flex-col gap-1">
                        <Badge variant="destructive" className="font-semibold shadow-md">
                          <AlertCircle className="h-3 w-3 mr-1" />FOR ANALYSIS
                        </Badge>
                        {video.coach_feedback && (
                          <Badge className="bg-success/90 text-success-foreground shadow-md">
                            <CheckCircle className="h-3 w-3 mr-1" />Reviewed
                          </Badge>
                        )}
                        <Badge className="bg-background/90 text-foreground shadow-md">
                          <User className="h-3 w-3 mr-1" />
                          {video.profiles?.full_name || video.profiles?.email || 'Unknown'}
                        </Badge>
                      </div>
                      {video.file_type === 'video' ? (
                        <>
                          {video.thumbnail_url ? (
                            <SignedLessonImg src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Play className="h-16 w-16 text-muted-foreground" />
                            </div>
                          )}
                          <a href={video.file_url} target="_blank" rel="noopener noreferrer"
                            className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                            <div className="h-16 w-16 rounded-full bg-card/90 shadow-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                              <Play className="h-7 w-7 text-accent ml-1" fill="currentColor" />
                            </div>
                          </a>
                        </>
                      ) : (
                        <SignedMediaImg src={video.file_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      )}
                    </div>
                    <CardContent className="p-5 space-y-3">
                      <h3 className="font-heading font-semibold text-lg text-foreground truncate">{video.title}</h3>
                      {video.description && <p className="text-sm text-muted-foreground line-clamp-2">{video.description}</p>}
                      {!video.coach_feedback && (
                        <div className="flex items-center gap-2 text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                          <Clock className="h-3 w-3" /><span>Awaiting your review</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(video.upload_date), 'MMM dd, yyyy')}</span>
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                        <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={() => handleOpenModal(video.id)}>
                          <Eye className="h-4 w-4" />Review
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="card-elevated">
              <CardContent className="py-20 text-center">
                <div className="h-20 w-20 icon-container bg-muted/60 text-muted-foreground mx-auto mb-6">
                  <BarChart3 className="h-10 w-10" />
                </div>
                <h3 className="font-heading font-semibold text-xl text-foreground mb-2">No analysis videos yet</h3>
                <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                  When students pay for and submit analysis videos, they will appear here
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <SocialFooter />

      <VideoDetailModal
        videoId={selectedVideoId}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        isCoach={true}
        onFeedbackSaved={handleFeedbackSaved}
      />

      {/* Single reassign modal */}
      {reassignVideo && (
        <ReassignVideoModal
          open={!!reassignVideo}
          onOpenChange={(v) => { if (!v) setReassignVideo(null); }}
          videoId={reassignVideo.id}
          videoTitle={reassignVideo.title}
          currentStudentId={reassignVideo.student_id}
        />
      )}

      {/* Bulk reassign — uses first selected video to open modal, then applies to all */}
      {bulkReassignOpen && selectedIds.size > 0 && (() => {
        const firstId = Array.from(selectedIds)[0];
        const firstVideo = analysisVideos.find(v => v.id === firstId);
        if (!firstVideo) return null;
        return (
          <ReassignVideoModal
            open={bulkReassignOpen}
            onOpenChange={(v) => { if (!v) { setBulkReassignOpen(false); clearSelection(); queryClient.invalidateQueries({ queryKey: ['admin-analysis-requests'] }); } }}
            videoId={firstVideo.id}
            videoTitle={`${selectedIds.size} video(s)`}
            currentStudentId={firstVideo.student_id}
          />
        );
      })()}

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent style={{ background: 'rgba(13,31,24,0.97)', borderColor: 'rgba(255,255,255,0.15)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F5F0E8]">Delete {selectedIds.size} video(s)?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#F5F0E8]/60">
              This action cannot be undone. The selected analysis videos will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="btn-glass">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
