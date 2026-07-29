import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { LineageNode, LineageEdge } from '../types';
import { X, FileText, Activity, AlertCircle, CheckCircle, UserCheck, Link } from 'lucide-react';
import { api } from '../services/api';

interface LineageGraphProps {
  nodes: LineageNode[];
  edges: LineageEdge[];
  width?: number;
  height?: number;
}

const getNodeColor = (type: string) => {
  switch (type) {
    case 'Figure': return '#f97316'; // orange-500
    case 'Run': return '#a855f7'; // purple-500
    case 'CodeVersion': return '#3b82f6'; // blue-500
    case 'Dataset': return '#22c55e'; // green-500
    case 'ParameterSet': return '#eab308'; // yellow-500
    case 'Environment': return '#06b6d4'; // cyan-500
    case 'Conclusion': return '#ef4444'; // red-500
    default: return '#94a3b8'; // slate-400
  }
};

const getStrokeColor = (status?: string) => {
  if (status === 'missing') return '#ef4444'; // red-500
  if (status === 'conflict') return '#eab308'; // yellow-500
  return '#ffffff';
};

export const LineageGraph: React.FC<LineageGraphProps> = ({ nodes: initialNodes, edges, width = 800, height = 600 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [nodes, setNodes] = useState<LineageNode[]>(initialNodes);
  const [edgeData, setEdgeData] = useState<LineageEdge[]>(edges);
  const [selectedNode, setSelectedNode] = useState<LineageNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<LineageEdge | null>(null);
  const [dimensions, setDimensions] = useState({ width, height });
  const [proposalStatus, setProposalStatus] = useState<'candidate' | 'accepted' | 'superseded' | 'quarantined' | 'duplicate'>('candidate');
  const [proposalReason, setProposalReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [edgeComment, setEdgeComment] = useState('');

  useEffect(() => setNodes(initialNodes), [initialNodes]);
  useEffect(() => setEdgeData(edges), [edges]);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 600
        });
      }
    };
    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const graphNodes = nodes.map(d => ({ ...d }));
    const graphLinks = edgeData.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(graphNodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(graphLinks).id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collide', d3.forceCollide().radius(50));

    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#94a3b8')
      .style('stroke', 'none');

    const link = svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(graphLinks)
      .enter().append('line')
      .attr('class', 'link')
      .style('cursor', 'pointer')
      .on('click', (_event, d: any) => {
        const originalEdge = edgeData.find((edge) => edge.id === d.id);
        if (originalEdge) {
          setSelectedEdge(originalEdge);
          setSelectedNode(null);
          setEdgeComment('');
          setReviewMessage('');
          setReviewError('');
        }
      })
      .attr('stroke-width', 2)
      .attr('marker-end', 'url(#arrowhead)')
      .style('stroke-dasharray', (d: any) => d.confidence === 'inferred' || d.confidence === 'hypothesis' ? '5,5' : 'none');

    const linkText = svg.append('g')
      .selectAll('text')
      .data(graphLinks)
      .enter().append('text')
      .attr('class', 'link-label')
      .attr('dy', -5)
      .attr('text-anchor', 'middle')
      .text((d: any) => d.relation);

    const node = svg.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(graphNodes)
      .enter().append('g')
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => {
        const originalNode = nodes.find(n => n.id === d.id);
        if (originalNode) {
          setSelectedNode(originalNode);
          setSelectedEdge(null);
          setProposalStatus(
            ['candidate', 'accepted', 'superseded', 'quarantined', 'duplicate'].includes(originalNode.status || '')
              ? originalNode.status as typeof proposalStatus
              : 'candidate'
          );
          setProposalReason('');
          setReviewMessage('');
          setReviewError('');
        }
      })
      .call(d3.drag<SVGGElement, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    node.append('circle')
      .attr('r', 18)
      .attr('fill', (d: any) => getNodeColor(d.type))
      .attr('stroke', (d: any) => getStrokeColor(d.status))
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', (d: any) => d.status === 'missing' ? '4,4' : 'none')
      .transition()
      .duration(300)
      .attr('r', (d: any) => selectedNode?.id === d.id ? 22 : 18);

    node.filter((d: any) => d.humanConfirmed)
      .append('circle')
      .attr('cx', 12)
      .attr('cy', -12)
      .attr('r', 6)
      .attr('fill', '#22c55e')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);

    node.filter((d: any) => d.humanConfirmed)
      .append('path')
      .attr('d', 'M 9 -12 L 11 -10 L 15 -15')
      .attr('fill', 'none')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    node.append('text')
      .attr('dx', 24)
      .attr('dy', 4)
      .text((d: any) => d.label)
      .attr('fill', '#1e293b')
      .style('font-weight', 'bold')
      .style('font-size', '12px');
      
    node.append('text')
      .attr('dx', 24)
      .attr('dy', 18)
      .text((d: any) => d.type)
      .attr('fill', '#64748b')
      .style('font-size', '10px');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      linkText
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edgeData, dimensions, selectedNode]);

  const handleConfirmNode = async () => {
    if (!selectedNode) return;
    setReviewBusy(true);
    setReviewError('');
    try {
      await api.confirmNode(selectedNode.id);
      const updatedNodes = nodes.map(n =>
        n.id === selectedNode.id ? { ...n, humanConfirmed: true, status: 'accepted' as const } : n
      );
      setNodes(updatedNodes);
      setSelectedNode({ ...selectedNode, humanConfirmed: true, status: 'accepted' });
      setReviewMessage('Human confirmation recorded in the audit log.');
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to confirm this node.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleStatusProposal = async () => {
    if (!selectedNode) return;
    if (!proposalReason.trim()) {
      setReviewError('Explain why this status should change.');
      return;
    }
    setReviewBusy(true);
    setReviewError('');
    try {
      await api.proposeAssetStatus(selectedNode.id, proposalStatus, proposalReason.trim());
      setReviewMessage(`Status proposal “${proposalStatus}” submitted for review. The formal status is unchanged.`);
      setProposalReason('');
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to submit the status proposal.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleEdgeReview = async (decision: 'confirm' | 'reject') => {
    if (!selectedEdge) return;
    if (!edgeComment.trim()) {
      setReviewError('Add a review comment that explains the evidence.');
      return;
    }
    setReviewBusy(true);
    setReviewError('');
    try {
      await api.reviewLineageEdge(selectedEdge.id, decision, edgeComment.trim());
      const updated = edgeData.map((edge) => edge.id === selectedEdge.id
        ? {
            ...edge,
            reviewStatus: decision === 'confirm' ? 'confirmed' as const : 'rejected' as const,
            confidence: decision === 'confirm' ? 'human_verified' as const : edge.confidence
          }
        : edge);
      setEdgeData(updated);
      setSelectedEdge(updated.find((edge) => edge.id === selectedEdge.id) || null);
      setEdgeComment('');
      setReviewMessage(`Relation ${decision === 'confirm' ? 'confirmed' : 'rejected'} and recorded as review evidence.`);
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Unable to review this relation.');
    } finally {
      setReviewBusy(false);
    }
  };

  const connectedEdges = selectedNode
    ? edgeData.map((edge) => {
        const isIncoming = edge.target === selectedNode.id;
        const isOutgoing = edge.source === selectedNode.id;
        if (!isIncoming && !isOutgoing) return null;
        const neighborId = isIncoming ? edge.source : edge.target;
        return {
          edge,
          direction: isIncoming ? 'Incoming' : 'Outgoing',
          neighbor: nodes.find((node) => node.id === neighborId)
        };
      }).filter((item): item is {
        edge: LineageEdge;
        direction: 'Incoming' | 'Outgoing';
        neighbor: LineageNode | undefined;
      } => item !== null)
    : [];

  const showEdgeDetails = (edge: LineageEdge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
    setEdgeComment('');
    setReviewMessage('');
    setReviewError('');
  };

  return (
    <div className="flex h-full border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm relative">
      <div ref={containerRef} className="flex-1 h-full relative">
        <svg ref={svgRef} width="100%" height="100%" className="w-full h-full" />
        {!selectedNode && (
          <div className="absolute top-4 left-4 bg-white/80 backdrop-blur px-3 py-2 rounded-md border border-slate-200 text-sm text-slate-600 pointer-events-none">
            Click on any node to view its lineage details and evidence.
          </div>
        )}
      </div>

      {/* Details Panel */}
      {selectedNode && (
        <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col h-full animate-in slide-in-from-right-8">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <FileText size={18} className="text-blue-500" />
              <span>Node Details</span>
            </h3>
            <button aria-label="Close node details" onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Label</p>
              <p className="text-lg font-bold text-slate-900 break-all">{selectedNode.label}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Type</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-800">
                  {selectedNode.type}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Status</p>
                <span className={`inline-flex text-xs font-medium rounded-full px-2 py-1 ${
                    selectedNode.status === 'accepted' ? 'bg-green-100 text-green-800' :
                    selectedNode.status === 'conflict' ? 'bg-yellow-100 text-yellow-800' :
                    selectedNode.status === 'missing' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}
                >
                  {selectedNode.status || 'unknown'}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                <Link size={14} />
                <span>Connected relationships</span>
              </p>
              <p className="mb-3 text-xs text-slate-500">
                Open a relationship to inspect its direction, confidence, and evidence IDs.
              </p>
              {connectedEdges.length > 0 ? (
                <div className="space-y-2">
                  {connectedEdges.map(({ edge, direction, neighbor }) => (
                    <button
                      key={edge.id}
                      type="button"
                      onClick={() => showEdgeDetails(edge)}
                      className="w-full rounded-md border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                      aria-label={`Open ${edge.relation} relationship with ${neighbor?.label || (direction === 'Incoming' ? edge.source : edge.target)}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{edge.relation}</span>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          direction === 'Incoming'
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {direction}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-slate-700">
                        {neighbor?.label || (direction === 'Incoming' ? edge.source : edge.target)}
                        {neighbor ? ` · ${neighbor.type}` : ''}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">
                        Evidence: {(edge.evidenceIds || []).join(', ') || 'none'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">
                  No relationships are connected to this node.
                </p>
              )}
            </div>

            {/* Human in the loop section */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center space-x-1">
                <UserCheck size={14} />
                <span>Human Review</span>
              </p>
              
              {selectedNode.humanConfirmed ? (
                <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-2 rounded border border-green-100">
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">Verified by human</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">This node's role in the lineage is inferred. Please confirm if it is correct.</p>
                  <button 
                    onClick={handleConfirmNode}
                    disabled={reviewBusy}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                  >
                    {reviewBusy ? 'Recording…' : 'Confirm & Accept'}
                  </button>
                </div>
              )}

              {selectedNode.type !== 'Project' && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                  <label htmlFor="status-proposal" className="block text-xs font-semibold text-slate-600">Propose a status</label>
                  <select
                    id="status-proposal"
                    value={proposalStatus}
                    onChange={(event) => setProposalStatus(event.target.value as typeof proposalStatus)}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                  >
                    <option value="candidate">Candidate</option>
                    <option value="accepted">Accepted</option>
                    <option value="superseded">Superseded</option>
                    <option value="quarantined">Quarantined</option>
                    <option value="duplicate">Duplicate</option>
                  </select>
                  <label htmlFor="status-reason" className="block text-xs font-semibold text-slate-600">Reason</label>
                  <textarea
                    id="status-reason"
                    value={proposalReason}
                    onChange={(event) => setProposalReason(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm"
                    placeholder="Evidence and replacement details"
                  />
                  <button
                    onClick={handleStatusProposal}
                    disabled={reviewBusy}
                    className="w-full rounded bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                  >
                    Submit proposal
                  </button>
                </div>
              )}
              {reviewMessage && <p role="status" className="mt-3 text-sm text-green-700">{reviewMessage}</p>}
              {reviewError && <p role="alert" className="mt-3 text-sm text-red-700">{reviewError}</p>}
            </div>

            {selectedNode.reproducibility && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 flex items-center space-x-1">
                  <Activity size={14} />
                  <span>Reproducibility</span>
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-2xl font-bold text-slate-800">{selectedNode.reproducibility}</span>
                  <span className="text-sm text-slate-500">
                    {selectedNode.reproducibility === 'R4' ? '(Verified)' :
                     selectedNode.reproducibility === 'R3' ? '(Runnable)' :
                     selectedNode.reproducibility === 'R2' ? '(Traceable)' :
                     selectedNode.reproducibility === 'R1' ? '(Locatable)' : '(Unknown)'}
                  </span>
                </div>
              </div>
            )}

            {selectedNode.evidenceIds && selectedNode.evidenceIds.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center space-x-1">
                  <Link size={14} />
                  <span>Evidence IDs</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedNode.evidenceIds.map(id => (
                    <span key={id} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono cursor-pointer hover:bg-blue-100">
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.details && Object.keys(selectedNode.details).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Metadata</p>
                <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                  {Object.entries(selectedNode.details).map(([key, value], idx) => (
                    <div key={key} className={`px-3 py-2 text-sm flex flex-col ${idx !== 0 ? 'border-t border-slate-100' : ''}`}>
                      <span className="text-slate-500 font-medium capitalize">{key.replace('_', ' ')}</span>
                      <span className="text-slate-800 font-mono mt-0.5 break-all">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.status === 'conflict' || selectedNode.status === 'missing' ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start space-x-2">
                <AlertCircle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">
                  This node has an active finding. Please check the Audit Findings tab for resolution steps.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {selectedEdge && (
        <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col h-full">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
            <h3 className="font-bold text-slate-800 flex items-center space-x-2">
              <Link size={18} className="text-blue-500" />
              <span>Relation Evidence</span>
            </h3>
            <button aria-label="Close relation details" onClick={() => setSelectedEdge(null)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            <div className="rounded border border-slate-200 bg-white p-3 text-sm">
              <p><span className="font-semibold">Relation:</span> {selectedEdge.relation}</p>
              <p className="mt-1 break-all"><span className="font-semibold">From:</span> {typeof selectedEdge.source === 'string' ? selectedEdge.source : ''}</p>
              <p className="mt-1 break-all"><span className="font-semibold">To:</span> {typeof selectedEdge.target === 'string' ? selectedEdge.target : ''}</p>
              <p className="mt-1"><span className="font-semibold">Confidence:</span> {selectedEdge.confidence}</p>
              <p className="mt-1"><span className="font-semibold">Review:</span> {selectedEdge.reviewStatus || 'not reviewed'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Evidence IDs</p>
              <div className="flex flex-wrap gap-2">
                {(selectedEdge.evidenceIds || []).map((id) => (
                  <span key={id} className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-mono">
                    {id}
                  </span>
                ))}
              </div>
            </div>
            <label htmlFor="edge-review-comment" className="block text-xs font-semibold text-slate-600">Review comment</label>
            <textarea
              id="edge-review-comment"
              value={edgeComment}
              onChange={(event) => setEdgeComment(event.target.value)}
              maxLength={2000}
              rows={5}
              className="w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm"
              placeholder="Describe the evidence used for this decision"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleEdgeReview('confirm')}
                disabled={reviewBusy}
                className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
              >
                Confirm
              </button>
              <button
                onClick={() => handleEdgeReview('reject')}
                disabled={reviewBusy}
                className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
              >
                Reject
              </button>
            </div>
            {reviewMessage && <p role="status" className="text-sm text-green-700">{reviewMessage}</p>}
            {reviewError && <p role="alert" className="text-sm text-red-700">{reviewError}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
