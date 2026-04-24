import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  APIProvider, 
  Map, 
  useMap, 
  useMapsLibrary,
  ControlPosition,
  useApiIsLoaded
} from '@vis.gl/react-google-maps';
import { MapContainer, TileLayer, Polygon as LeafletPolygon, Polyline as LeafletPolyline, Marker as LeafletMarker, useMap as useLeafletMap, Tooltip as LeafletTooltip } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import { Point, Territory, TerritoryGroup, MapProvider } from '../types';
import { Plus, Save, Trash2, Info, Calendar, Hash, Palette, X, Map as MapIcon, AlertTriangle, CheckCircle2, Search, Download, Camera, Clock, FileText, Menu, Settings, Layers, Globe, User, Upload, Activity, History, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { MapMarker } from './MapMarker';
import { useTranslation } from 'react-i18next';

interface MapEditorProps {
  territories: Territory[];
  groups: TerritoryGroup[];
  onSaveTerritory: (territory: Territory) => void;
  onDeleteTerritory: (id: string) => void;
  onClearAllTerritories: () => void;
  onSaveGroup: (group: TerritoryGroup) => void;
  onDeleteGroup: (id: string) => void;
  mapProvider: MapProvider;
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const getCentroid = (points: Point[]): Point | null => {
  if (!points || points.length === 0) return null;
  let lat = 0;
  let lng = 0;
  let count = 0;

  points.forEach(p => {
    if (typeof p.lat === 'number' && !isNaN(p.lat) && 
        typeof p.lng === 'number' && !isNaN(p.lng)) {
      lat += p.lat;
      lng += p.lng;
      count++;
    }
  });

  if (count === 0) return null;
  return { lat: lat / count, lng: lng / count };
};

const TerritoryOverlay: React.FC<{ 
  territories: Territory[], 
  selectedId: string | null, 
  isEditingShape: boolean,
  onSelect: (id: string) => void,
  onSaveTerritory: (territory: Territory) => void
}> = ({ territories, selectedId, isEditingShape, onSelect, onSaveTerritory }) => {
  const map = useMap();
  const maps = useMapsLibrary('maps');

  if (!map || !maps) return null;

  return (
    <>
      {territories.map(t => {
        const centroid = getCentroid(t.points);
        if (!centroid) return null;

        return (
          <React.Fragment key={t.id}>
            {t.type === 'line' ? (
              <Polyline
                paths={t.points}
                editable={selectedId === t.id && isEditingShape}
                onPathChange={(newPoints: Point[]) => {
                  onSaveTerritory({ ...t, points: newPoints });
                }}
                options={{
                  strokeColor: t.strokeColor || (selectedId === t.id ? '#000' : t.color),
                  strokeWeight: t.strokeWeight ?? (selectedId === t.id ? 3 : 2),
                }}
                onClick={() => onSelect(t.id)}
              />
            ) : (
              <Polygon
                paths={t.points}
                editable={selectedId === t.id && isEditingShape}
                onPathChange={(newPoints: Point[]) => {
                  onSaveTerritory({ ...t, points: newPoints });
                }}
                options={{
                  fillColor: t.color,
                  fillOpacity: t.fillOpacity ?? (selectedId === t.id ? 0.6 : 0.4),
                  strokeColor: t.strokeColor || (selectedId === t.id ? '#000' : t.color),
                  strokeWeight: t.strokeWeight ?? (selectedId === t.id ? 3 : 2),
                }}
                onClick={() => onSelect(t.id)}
              />
            )}
            <LabelOverlay 
              position={centroid} 
              text={(t.number || 0).toString()} 
              color={t.color}
            />
            {/* Added Map Pin like in the user image */}
            <MapMarker 
              position={centroid} 
              color={selectedId === t.id ? '#000' : t.color}
              number={t.number}
              onClick={() => onSelect(t.id)}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

// Custom Label Overlay using google.maps.OverlayView for superior styling
const LabelOverlay = ({ position, text, color }: { position: Point, text: string, color: string }) => {
  const map = useMap();
  const [container] = useState(() => document.createElement('div'));
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  React.useEffect(() => {
    if (!map || !window.google) return;

    const overlay = new google.maps.OverlayView();
    overlayRef.current = overlay;

    overlay.onAdd = () => {
      const panes = overlay.getPanes();
      if (panes) {
        panes.floatPane.appendChild(container);
      }
    };

    overlay.draw = () => {
      const projection = overlay.getProjection();
      if (!projection) return;

      const pos = projection.fromLatLngToDivPixel(new google.maps.LatLng(position.lat, position.lng));
      if (pos) {
        container.style.position = 'absolute';
        container.style.left = `${pos.x}px`;
        container.style.top = `${pos.y}px`;
        container.style.transform = 'translate(-50%, -50%)';
        container.style.zIndex = '40';
      }
    };

    overlay.onRemove = () => {
      if (container.parentElement) {
        container.parentElement.removeChild(container);
      }
      overlayRef.current = null;
    };

    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map, position]);

  return createPortal(
    <div className="pointer-events-none">
      <div className="px-2 py-1 bg-white border-2 border-black rounded shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center min-w-[60px]">
        <span className="text-[10px] font-black uppercase text-black whitespace-nowrap">
          Território {text}
        </span>
      </div>
    </div>,
    container
  );
};

// Simple Polygon component for @vis.gl/react-google-maps
const Polygon = (props: any) => {
  const map = useMap();
  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null);

  React.useEffect(() => {
    if (!map || !window.google) return;
    try {
      const poly = new google.maps.Polygon(props.options);
      poly.setMap(map);
      setPolygon(poly);
      return () => poly.setMap(null);
    } catch (e) {
      console.error('Error creating polygon:', e);
    }
  }, [map]);

  React.useEffect(() => {
    if (!polygon) return;
    polygon.setOptions(props.options);
    
    // Check if paths actually changed to avoid infinite loops
    const currentPaths = polygon.getPaths().getAt(0).getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
    if (JSON.stringify(currentPaths) !== JSON.stringify(props.paths)) {
      polygon.setPaths(props.paths);
    }

    if (props.editable) {
      polygon.setEditable(true);
      polygon.setDraggable(true);
      
      const onEdit = () => {
        const path = polygon.getPath();
        const newPoints = [];
        for (let i = 0; i < path.getLength(); i++) {
          const point = path.getAt(i);
          newPoints.push({ lat: point.lat(), lng: point.lng() });
        }
        if (props.onPathChange) {
          props.onPathChange(newPoints);
        }
      };

      const listeners = [
        polygon.getPath().addListener('set_at', onEdit),
        polygon.getPath().addListener('insert_at', onEdit),
        polygon.getPath().addListener('remove_at', onEdit),
        polygon.addListener('dragend', onEdit)
      ];

      return () => {
        listeners.forEach(l => l.remove());
      };
    } else {
      polygon.setEditable(false);
      polygon.setDraggable(false);
    }
  }, [polygon, props.options, props.paths, props.editable]);

  React.useEffect(() => {
    if (!polygon || !props.onClick) return;
    const listener = polygon.addListener('click', props.onClick);
    return () => {
      if (listener) listener.remove();
    };
  }, [polygon, props.onClick]);

  return null;
};

// Polyline component for @vis.gl/react-google-maps
const Polyline = (props: any) => {
  const map = useMap();
  const [polyline, setPolyline] = useState<google.maps.Polyline | null>(null);

  React.useEffect(() => {
    if (!map || !window.google) return;
    try {
      const poly = new google.maps.Polyline(props.options);
      poly.setMap(map);
      setPolyline(poly);
      return () => poly.setMap(null);
    } catch (e) {
      console.error('Error creating polyline:', e);
    }
  }, [map]);

  React.useEffect(() => {
    if (!polyline) return;
    polyline.setOptions(props.options);
    
    const currentPaths = polyline.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
    if (JSON.stringify(currentPaths) !== JSON.stringify(props.paths)) {
      polyline.setPath(props.paths);
    }

    if (props.editable) {
      polyline.setEditable(true);
      polyline.setDraggable(true);
      
      const onEdit = () => {
        const path = polyline.getPath();
        const newPoints = [];
        for (let i = 0; i < path.getLength(); i++) {
          const point = path.getAt(i);
          newPoints.push({ lat: point.lat(), lng: point.lng() });
        }
        if (props.onPathChange) {
          props.onPathChange(newPoints);
        }
      };

      const listeners = [
        polyline.getPath().addListener('set_at', onEdit),
        polyline.getPath().addListener('insert_at', onEdit),
        polyline.getPath().addListener('remove_at', onEdit),
        polyline.addListener('dragend', onEdit)
      ];

      return () => {
        listeners.forEach(l => l.remove());
      };
    } else {
      polyline.setEditable(false);
      polyline.setDraggable(false);
    }
  }, [polyline, props.options, props.paths, props.editable]);

  React.useEffect(() => {
    if (!polyline || !props.onClick) return;
    const listener = polyline.addListener('click', props.onClick);
    return () => {
      if (listener) listener.remove();
    };
  }, [polyline, props.onClick]);

  return null;
};

// --- LEAFLET HELPERS ---

const LeafletMapEvents = ({ onClick }: { onClick: (e: any) => void }) => {
  const map = useLeafletMap();
  React.useEffect(() => {
    map.on('click', (e) => {
      onClick({ detail: { latLng: { lat: e.latlng.lat, lng: e.latlng.lng } } });
    });
  }, [map, onClick]);
  return null;
};

const SetViewOnCenterChange = ({ center }: { center: [number, number] }) => {
  const map = useLeafletMap();
  const lastCenter = React.useRef(center);

  React.useEffect(() => {
    // Only set view if center actually changed from the last known state
    if (center[0] !== lastCenter.current[0] || center[1] !== lastCenter.current[1]) {
      map.setView(center, map.getZoom());
      lastCenter.current = center;
    }
  }, [center, map]);
  return null;
};

const LeafletEditablePolyline = ({ positions, pathOptions, editable, onPointsChange, eventHandlers }: any) => {
  const polyRef = useRef<L.Polyline | null>(null);

  useEffect(() => {
    const poly = polyRef.current;
    if (!poly) return;

    if (editable) {
      // @ts-ignore - pm is added by leaflet-geoman
      if (poly.pm) {
        // @ts-ignore
        poly.pm.enable();
        poly.on('pm:edit', (e: any) => {
          const latLngs = e.target.getLatLngs();
          // Geoman returns a flat array for Polylines
          const newPoints = latLngs.map((ll: L.LatLng) => ({ lat: ll.lat, lng: ll.lng }));
          onPointsChange(newPoints);
        });
        poly.on('pm:dragend', (e: any) => {
          const latLngs = e.target.getLatLngs();
          const newPoints = latLngs.map((ll: L.LatLng) => ({ lat: ll.lat, lng: ll.lng }));
          onPointsChange(newPoints);
        });
      }
    } else {
      // @ts-ignore
      if (poly.pm) {
        // @ts-ignore
        poly.pm.disable();
      }
    }

    return () => {
      // @ts-ignore
      if (poly.pm) {
        // @ts-ignore
        poly.pm.disable();
      }
      poly.off('pm:edit');
      poly.off('pm:dragend');
    };
  }, [editable, onPointsChange]);

  return (
    <LeafletPolyline 
      ref={polyRef}
      positions={positions}
      pathOptions={pathOptions}
      eventHandlers={eventHandlers}
    />
  );
};

const GoogleMapHandler = ({ center }: { center: google.maps.LatLngLiteral }) => {
  const map = useMap();
  const lastCenter = React.useRef(center);

  React.useEffect(() => {
    if (map && (center.lat !== lastCenter.current.lat || center.lng !== lastCenter.current.lng)) {
      map.panTo(center);
      lastCenter.current = center;
    }
  }, [center, map]);
  return null;
};

const LeafletTerritoryOverlay: React.FC<{ 
  territories: Territory[], 
  selectedId: string | null, 
  isEditingShape: boolean,
  onSelect: (id: string) => void,
  onSaveTerritory: (territory: Territory) => void
}> = ({ territories, selectedId, isEditingShape, onSelect, onSaveTerritory }) => {
  return (
    <>
      {territories.map(t => {
        const centroid = getCentroid(t.points);
        if (!centroid) return null;

        const leafletPoints = t.points.map(p => [p.lat, p.lng] as L.LatLngExpression);

        // Custom DivIcon for the marker to match Google implementation
        const pinIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `
            <div class="relative group">
              <svg width="34" height="42" viewBox="0 0 34 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17 0C7.61116 0 0 7.61116 0 17C0 29.75 17 42 17 42C17 42 34 29.75 34 17C34 7.61116 26.3888 0 17 0ZM17 23.1875C13.5833 23.1875 10.8125 20.4167 10.8125 17C10.8125 13.5833 13.5833 10.8125 17 10.8125C20.4167 10.8125 23.1875 13.5833 23.1875 17C23.1875 20.4167 20.4167 23.1875 17 23.1875Z" fill="${selectedId === t.id ? '#000' : t.color}"/>
                <circle cx="17" cy="17" r="7" fill="white" />
              </svg>
              ${t.number ? `<div class="absolute top-[13px] left-1/2 -translate-x-1/2 text-[8px] font-black text-black">${t.number}</div>` : ''}
              <div class="absolute top-[-30px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                 <div class="px-2 py-1 bg-white border border-black rounded shadow text-[8px] font-black uppercase whitespace-nowrap">
                  Território ${t.number}
                </div>
              </div>
            </div>
          `,
          iconSize: [34, 42],
          iconAnchor: [17, 42],
        });

        return (
          <React.Fragment key={t.id}>
            {t.type === 'line' ? (
              <LeafletEditablePolyline
                positions={leafletPoints}
                pathOptions={{
                  color: t.strokeColor || (selectedId === t.id ? '#000' : t.color),
                  weight: t.strokeWeight ?? (selectedId === t.id ? 3 : 2),
                }}
                editable={selectedId === t.id && isEditingShape}
                onPointsChange={(newPoints: Point[]) => {
                  onSaveTerritory({ ...t, points: newPoints });
                }}
                eventHandlers={{
                  click: () => onSelect(t.id)
                }}
              />
            ) : (
              <LeafletPolygon
                positions={leafletPoints}
                pathOptions={{
                  fillColor: t.color,
                  fillOpacity: t.fillOpacity ?? (selectedId === t.id ? 0.6 : 0.4),
                  color: t.strokeColor || (selectedId === t.id ? '#000' : t.color),
                  weight: t.strokeWeight ?? (selectedId === t.id ? 3 : 2),
                }}
                eventHandlers={{
                  click: () => onSelect(t.id)
                }}
              />
            )}
            <LeafletMarker 
              position={[centroid.lat, centroid.lng]} 
              icon={pinIcon}
              eventHandlers={{
                click: () => onSelect(t.id)
              }}
            >
              <LeafletTooltip direction="top" offset={[0, -40]} opacity={1}>
                <div className="px-2 py-1 bg-white border border-black rounded shadow text-[10px] font-black uppercase whitespace-nowrap">
                  Território {t.number}
                </div>
              </LeafletTooltip>
            </LeafletMarker>
          </React.Fragment>
        );
      })}
    </>
  );
};

export const MapEditor: React.FC<MapEditorProps> = ({
  territories,
  groups,
  onSaveTerritory,
  onDeleteTerritory,
  onClearAllTerritories,
  onSaveGroup,
  onDeleteGroup,
  mapProvider
}) => {
  const { t } = useTranslation();
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [mapCenter, setMapCenter] = useState<Point>({ lat: -23.5505, lng: -46.6333 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'areas' | 'territories' | 'activity'>('territories');
  const [isEditingShape, setIsEditingShape] = useState(false);
  const [drawingType, setDrawingType] = useState<'area' | 'line'>('area');

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCenter = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setMapCenter(newCenter);
        },
        (error) => {
          console.warn("Geolocation error:", error);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounced save for geometry updates to prevent rate limiting
  const debouncedSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedSaveTerritory = useCallback((territory: Territory) => {
    if (debouncedSaveTimeoutRef.current) {
      clearTimeout(debouncedSaveTimeoutRef.current);
    }
    debouncedSaveTimeoutRef.current = setTimeout(() => {
      onSaveTerritory(territory);
    }, 1000); // 1 second debounce for geometry
  }, [onSaveTerritory]);

  const handleSelectTerritory = useCallback((id: string) => {
    setSelectedTerritoryId(id);
    setIsSidebarOpen(true);
    setIsEditingShape(false);
  }, []);

  const selectedTerritory = territories.find(t => t.id === selectedTerritoryId);

  const handleGroupFilter = (groupId: string) => {
    const groupTerritories = territories.filter(t => t.groupId === groupId);
    if (groupTerritories.length > 0 && mapRef.current) {
      // Find bounds
      const bounds = new google.maps.LatLngBounds();
      groupTerritories.forEach(t => {
        t.points.forEach(p => bounds.extend(p));
      });
      // We need access to the map instance to fitBounds
    }
  };

  const handleMapClick = useCallback((e: any) => {
    if (!isDrawing) return;
    const latLng = e.detail.latLng;
    if (!latLng) return;
    
    // google.maps.LatLng objects use .lat() and .lng() methods
    const lat = typeof latLng.lat === 'function' ? latLng.lat() : latLng.lat;
    const lng = typeof latLng.lng === 'function' ? latLng.lng() : latLng.lng;

    if (typeof lat === 'number' && typeof lng === 'number') {
      setCurrentPoints(prev => [...prev, { lat, lng }]);
    }
  }, [isDrawing]);

  const exportAsImage = async () => {
    if (!mapRef.current) return;
    setIsCapturing(true);
    try {
      // We use a filter to skip Google Maps UI elements which often cause CORS issues with external CSS
      const filter = (node: HTMLElement) => {
        const exclusionClasses = ['gm-style-cc', 'gm-svpc', 'gm-style-mtc'];
        if (node.classList) {
          return !exclusionClasses.some(className => node.classList.contains(className));
        }
        return true;
      };

      const dataUrl = await toPng(mapRef.current, {
        cacheBust: true,
        filter: filter,
        skipFonts: true, // Skipping fonts often avoids the 'Cannot access rules' error
      });
      const link = document.createElement('a');
      link.download = `territories-${new Date().getTime()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to capture map:', err);
      // Fallback: try without the map background if possible, or show a better message
      alert('Note: Map background capture might be limited due to browser security. All territories and numbers should still be saved.');
    } finally {
      setIsCapturing(false);
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(territories, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `territories-data-${new Date().getTime()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        if (!content) return;
        
        const json = JSON.parse(content);
        let territoriesToImport: Territory[] = [];

        if (Array.isArray(json)) {
          territoriesToImport = json;
        } else if (json.territories && Array.isArray(json.territories)) {
          // Support cases where the export might be an object containing a territories array
          territoriesToImport = json.territories;
        }

        if (territoriesToImport.length > 0) {
          // Import territories
          for (const terrData of territoriesToImport) {
            const { id, ...data } = terrData;
            onSaveTerritory({ ...data, id: id || Math.random().toString(36).substr(2, 9) });
          }
          alert(t('messages.importSuccess'));
        } else {
          alert(t('messages.importError'));
        }
      } catch (err) {
        console.error('Erro ao importar dados:', err);
        alert(t('messages.processError'));
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearAll = () => {
    if (window.confirm(t('messages.confirmClear'))) {
      onClearAllTerritories();
      setSelectedTerritoryId(null);
    }
  };

  const exportActivitiesPDF = () => {
    const doc = new jsPDF();
    const sortedTerritories = [...territories].sort((a, b) => a.number - b.number);

    const tableData: any[] = [];
    sortedTerritories.forEach(terr => {
      // Identity data to repeat if needed
      const terrInfo = [terr.number.toString(), terr.name];
      
      // Add current state
      tableData.push([
        ...terrInfo,
        terr.responsiblePerson || t('fields.notAssigned'),
        terr.completionDate ? t('fields.completed') : t('map.pending')
      ]);

      // Add activities history
      if (terr.activities && terr.activities.length > 0) {
        terr.activities.forEach(act => {
          tableData.push([
             ...terrInfo,
             act.responsible,
             act.completionDate ? `${t('fields.completed')} (${act.completionDate})` : t('map.pending')
          ]);
        });
      }
    });

    doc.setFontSize(18);
    doc.text(t('map.activity'), 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${t('map.reportGenerated')}: ${new Date().toLocaleString()}`, 14, 30);

    autoTable(doc, {
      startY: 35,
      head: [[t('fields.number'), t('fields.name'), t('fields.responsible'), t('map.status')]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 60 },
        2: { cellWidth: 60 },
        3: { cellWidth: 40 }
      }
    });

    doc.save(`atividades-${new Date().getTime()}.pdf`);
  };

  const exportActivitiesExcel = () => {
    const sortedTerritories = [...territories].sort((a, b) => a.number - b.number);

    const worksheetData: any[] = [];
    sortedTerritories.forEach(terr => {
      // Main record
      worksheetData.push({
        [t('fields.number')]: terr.number,
        [t('fields.name')]: terr.name,
        [t('fields.responsible')]: terr.responsiblePerson || t('fields.notAssigned'),
        [t('map.status')]: terr.completionDate ? t('fields.completed') : t('map.pending'),
        [t('fields.date')]: terr.completionDate || 'N/A',
        'Tipo': 'Atual'
      });

      // History records
      if (terr.activities && terr.activities.length > 0) {
        terr.activities.forEach(act => {
          worksheetData.push({
            [t('fields.number')]: terr.number,
            [t('fields.name')]: terr.name,
            [t('fields.responsible')]: act.responsible,
            [t('map.status')]: act.completionDate ? t('fields.completed') : t('map.pending'),
            [t('fields.date')]: act.completionDate || 'N/A',
            'Tipo': 'Histórico'
          });
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Atividades');
    
    worksheet['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 15 }];

    XLSX.writeFile(workbook, `atividades-${new Date().getTime()}.xlsx`);
  };

  const finishDrawing = () => {
    const minPoints = drawingType === 'area' ? 3 : 2;
    if (currentPoints.length < minPoints) {
      setIsDrawing(false);
      setCurrentPoints([]);
      return;
    }

    const newTerritory: Territory = {
      id: Math.random().toString(36).substr(2, 9),
      mapId: 'default',
      name: `${t(drawingType === 'area' ? 'map.new' : 'line')} ${territories.length + 1}`,
      info: '',
      color: '#3B82F6',
      number: territories.length + 1,
      completionDate: null,
      responsiblePerson: '',
      points: currentPoints,
      type: drawingType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onSaveTerritory(newTerritory);
    setIsDrawing(false);
    setCurrentPoints([]);
    setSelectedTerritoryId(newTerritory.id);
  };

  if (mapProvider === 'google' && (!API_KEY || API_KEY.startsWith('YOUR_') || API_KEY.length < 20)) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f5f5f5] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="bg-amber-50 p-6 flex items-center gap-4 border-b border-amber-100">
            <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
              <AlertTriangle size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-amber-900">Map Configuration Required</h3>
              <p className="text-sm text-amber-700">Google Maps background is not yet active.</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-blue-500" />
                How to fix this:
              </h4>
              <ol className="space-y-3 text-sm text-gray-600 list-decimal list-inside">
                <li>Go to the <span className="font-medium text-gray-900">Secrets</span> panel in the app settings.</li>
                <li>Add a secret named <code className="bg-gray-100 px-1.5 py-0.5 rounded text-blue-600 font-mono">VITE_GOOGLE_MAPS_API_KEY</code>.</li>
                <li>Paste your <span className="font-medium text-gray-900">Maps JavaScript API</span> key.</li>
                <li>Ensure the API is enabled in your <a href="https://console.cloud.google.com/" target="_blank" className="text-blue-600 hover:underline">Google Cloud Console</a>.</li>
              </ol>
            </div>

            <div className="pt-6 border-t border-gray-100">
              <p className="text-xs text-gray-400 mb-4">
                <b>Note:</b> If you see an "InvalidKeyMapError" on the map itself, it means the key is technically present but rejected by Google (check your billing or API restrictions).
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                Refresh App
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <div className="flex flex-col md:flex-row h-full overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200 relative">
        {/* Map Area */}
        <div ref={mapRef} className="flex-1 relative bg-gray-100 overflow-hidden min-h-[400px]">
          {mapProvider === 'google' ? (
            <Map
              defaultCenter={mapCenter}
              defaultZoom={18}
              onClick={handleMapClick}
              disableDefaultUI={true}
              zoomControl={true}
              rotateControl={true}
              className="w-full h-full"
            >
              <GoogleMapHandler center={mapCenter} />
              <TerritoryOverlay 
                territories={territories} 
                selectedId={selectedTerritoryId}
                isEditingShape={isEditingShape}
                onSelect={handleSelectTerritory}
                onSaveTerritory={debouncedSaveTerritory}
              />

              {/* Current Drawing Path */}
              {isDrawing && currentPoints.length > 0 && (
                drawingType === 'area' ? (
                  <Polygon
                    paths={currentPoints}
                    options={{
                      fillColor: '#3B82F6',
                      fillOpacity: 0.2,
                      strokeColor: '#3B82F6',
                      strokeWeight: 2,
                      strokeDasharray: '4',
                    }}
                  />
                ) : (
                  <Polyline
                    paths={currentPoints}
                    options={{
                      strokeColor: '#3B82F6',
                      strokeWeight: 2,
                      strokeDasharray: '4',
                    }}
                  />
                )
              )}

            </Map>
          ) : (
            <MapContainer 
              center={[mapCenter.lat, mapCenter.lng]} 
              zoom={18} 
              style={{ height: '100%', width: '100%', zIndex: 1 }}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LeafletMapEvents onClick={handleMapClick} />
              <SetViewOnCenterChange center={[mapCenter.lat, mapCenter.lng]} />
              <LeafletTerritoryOverlay 
                territories={territories} 
                selectedId={selectedTerritoryId}
                isEditingShape={isEditingShape}
                onSelect={handleSelectTerritory}
                onSaveTerritory={debouncedSaveTerritory}
              />

              {/* Current Drawing Path */}
              {isDrawing && currentPoints.length > 0 && (
                drawingType === 'area' ? (
                  <LeafletPolygon
                    positions={currentPoints.map(p => [p.lat, p.lng] as L.LatLngExpression)}
                    pathOptions={{
                      fillColor: '#3B82F6',
                      fillOpacity: 0.2,
                      color: '#3B82F6',
                      weight: 2,
                      dashArray: '4',
                    }}
                  />
                ) : (
                  <LeafletPolyline
                    positions={currentPoints.map(p => [p.lat, p.lng] as L.LatLngExpression)}
                    pathOptions={{
                      color: '#3B82F6',
                      weight: 2,
                      dashArray: '4',
                    }}
                  />
                )
              )}

            </MapContainer>
          )}

          {/* Controls Overlay */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-30">
            <div className="flex flex-wrap gap-2 max-w-[70%]">
              {!isDrawing ? (
                <>
                  <button
                    onClick={() => setIsDrawing(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors shadow-lg"
                  >
                    <Plus size={18} />
                    <span className="hidden sm:inline">{t('map.new')}</span>
                  </button>
                  <button
                    onClick={exportAsImage}
                    disabled={isCapturing}
                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-lg disabled:opacity-50"
                  >
                    <Camera size={18} />
                    <span className="hidden sm:inline">{isCapturing ? '...' : t('map.photo')}</span>
                  </button>
                  <button
                    onClick={exportData}
                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-lg"
                  >
                    <Download size={18} />
                    <span className="hidden sm:inline">{t('map.export')}</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-lg"
                  >
                    <Upload size={18} />
                    <span className="hidden sm:inline">{t('map.import')}</span>
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportData}
                    accept=".json"
                    className="hidden"
                  />
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-2 px-3 py-2 bg-white text-red-600 border border-red-100 rounded-lg hover:bg-red-50 transition-colors shadow-lg"
                  >
                    <Trash2 size={18} />
                    <span className="hidden sm:inline">{t('map.clear')}</span>
                  </button>
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-500 rounded-lg shadow-sm border border-gray-200">
                    <Globe size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">{mapProvider === 'google' ? t('map.google') : t('map.osm')}</span>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={finishDrawing}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg"
                  >
                    <Save size={18} />
                    <span>{t('map.finish')}</span>
                  </button>
                  <button
                    onClick={() => { setIsDrawing(false); setCurrentPoints([]); }}
                    className="flex items-center gap-2 px-3 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-lg"
                  >
                    <X size={18} />
                    <span>{t('map.cancel')}</span>
                  </button>

                  <div className="flex bg-white rounded-lg shadow-lg border border-gray-200 p-1">
                    <button
                      onClick={() => setDrawingType('area')}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                        drawingType === 'area' ? 'bg-black text-white' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {t('fields.area')}
                    </button>
                    <button
                      onClick={() => setDrawingType('line')}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${
                        drawingType === 'line' ? 'bg-black text-white' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {t('fields.line')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Sidebar Toggle (Mobile) */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden flex items-center justify-center p-3 bg-white text-black border-2 border-black rounded-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none transition-all"
            >
              {isSidebarOpen ? <X size={20} /> : <Settings size={20} />}
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {(isSidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`
                fixed md:relative inset-0 md:inset-auto z-40 md:z-auto
                w-full md:w-80 border-l border-gray-200 flex flex-col bg-white
                ${isSidebarOpen ? 'flex' : 'hidden md:flex'}
              `}
            >
              <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Info size={14} />
                    {selectedTerritory ? t('map.details') : sidebarTab === 'areas' ? t('map.manageAreas') : sidebarTab === 'activity' ? t('map.recentActivity') : t('map.savedTerritories')}
                  </h2>
                  <button 
                    onClick={() => setIsSidebarOpen(false)}
                    className="md:hidden p-2 hover:bg-gray-100 rounded-full"
                  >
                    <X size={18} />
                  </button>
                </div>

                {!selectedTerritory && (
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => setSidebarTab('territories')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        sidebarTab === 'territories' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <MapIcon size={14} />
                      {t('map.list')}
                    </button>
                    <button
                      onClick={() => setSidebarTab('activity')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        sidebarTab === 'activity' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <History size={14} />
                      {t('map.activity')}
                    </button>
                    <button
                      onClick={() => setSidebarTab('areas')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        sidebarTab === 'areas' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <Layers size={14} />
                      {t('map.areas')}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {selectedTerritory ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <button 
                  onClick={() => {
                    setSelectedTerritoryId(null);
                    setIsEditingShape(false);
                  }}
                  className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase hover:text-black transition-colors mb-2"
                >
                  <ChevronLeft size={14} />
                  {t('map.back')} {sidebarTab === 'activity' ? t('map.activity') : sidebarTab === 'areas' ? t('map.areas') : t('map.list')}
                </button>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-medium text-gray-400 uppercase">{t('fields.name')}</label>
                    <button
                      onClick={() => setIsEditingShape(!isEditingShape)}
                      className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${
                        isEditingShape 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {isEditingShape ? 'TRAVAR FORMATO' : 'EDITAR FORMATO'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={selectedTerritory.name}
                    onChange={(e) => onSaveTerritory({ ...selectedTerritory, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <p className="text-[10px] text-blue-500 font-medium italic mt-1 italic">
                    * {t('map.editTip', 'Dica: Arraste os pontos no mapa para alterar o formato.')}
                  </p>
                </div>

                <div className="flex bg-gray-50 border border-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => onSaveTerritory({ ...selectedTerritory, type: 'area' })}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${
                      selectedTerritory.type !== 'line' ? 'bg-white text-black shadow-sm' : 'text-gray-400 opacity-50'
                    }`}
                  >
                    {t('fields.area')}
                  </button>
                  <button
                    onClick={() => onSaveTerritory({ ...selectedTerritory, type: 'line' })}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded transition-all ${
                      selectedTerritory.type === 'line' ? 'bg-white text-black shadow-sm' : 'text-gray-400 opacity-50'
                    }`}
                  >
                    {t('fields.line')}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                      <Hash size={12} /> {t('fields.number')}
                    </label>
                    <input
                      type="number"
                      value={selectedTerritory.number}
                      onChange={(e) => onSaveTerritory({ ...selectedTerritory, number: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                      <Palette size={12} /> {t('fields.color')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={selectedTerritory.color}
                        onChange={(e) => onSaveTerritory({ ...selectedTerritory, color: e.target.value })}
                        className="w-10 h-10 p-1 border border-gray-200 rounded-md cursor-pointer"
                      />
                      <div className="flex-1 flex flex-wrap gap-1">
                        {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'].map(c => (
                          <button
                            key={c}
                            onClick={() => onSaveTerritory({ ...selectedTerritory, color: c })}
                            className="w-4 h-4 rounded-full border border-gray-200"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {selectedTerritory.type !== 'line' && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                        {t('fields.opacity')}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={selectedTerritory.fillOpacity ?? 0.4}
                        onChange={(e) => onSaveTerritory({ ...selectedTerritory, fillOpacity: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                        <span>0%</span>
                        <span>{( (selectedTerritory.fillOpacity ?? 0.4) * 100).toFixed(0)}%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}
                  <div className={`space-y-1 ${selectedTerritory.type === 'line' ? 'col-span-2' : ''}`}>
                    <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                      {t('fields.borderWidth')}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      value={selectedTerritory.strokeWeight ?? 2}
                      onChange={(e) => onSaveTerritory({ ...selectedTerritory, strokeWeight: parseInt(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-bold">
                      <span>1px</span>
                      <span>{selectedTerritory.strokeWeight ?? 2}px</span>
                      <span>10px</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                    <Palette size={12} /> {t('fields.strokeColor')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedTerritory.strokeColor || selectedTerritory.color}
                      onChange={(e) => onSaveTerritory({ ...selectedTerritory, strokeColor: e.target.value })}
                      className="w-10 h-10 p-1 border border-gray-200 rounded-md cursor-pointer"
                    />
                    <div className="flex-1 flex flex-wrap gap-1">
                      {['#000000', '#FFFFFF', '#3B82F6', '#EF4444', '#10B981'].map(c => (
                        <button
                          key={c}
                          onClick={() => onSaveTerritory({ ...selectedTerritory, strokeColor: c })}
                          className="w-4 h-4 rounded-full border border-gray-200"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-medium text-gray-400 uppercase flex items-center gap-1">
                        {t('fields.group')}
                      </label>
                      <button 
                        onClick={() => {
                          setSelectedTerritoryId(null);
                          setSidebarTab('areas');
                        }}
                        className="text-[10px] font-bold text-blue-500 uppercase hover:underline"
                      >
                        {t('fields.manageGroups')}
                      </button>
                    </div>
                    <select
                      value={selectedTerritory.groupId || ''}
                      onChange={(e) => onSaveTerritory({ ...selectedTerritory, groupId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    >
                      <option value="">{t('fields.noGroup')}</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-400 uppercase">{t('fields.info')}</label>
                    <textarea
                      value={selectedTerritory.info}
                      onChange={(e) => onSaveTerritory({ ...selectedTerritory, info: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                      placeholder={`${t('fields.info')}...`}
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                      <History size={14} className="text-blue-500" />
                      {t('map.activitiesHistory')}
                    </h4>
                  </div>

                  <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="space-y-2">
                       <input
                         type="text"
                         placeholder={t('fields.responsible')}
                         id="new-activity-responsible"
                         className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                       />
                       <input
                         type="date"
                         id="new-activity-date"
                         className="w-full px-3 py-2 text-xs border border-gray-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                         defaultValue={new Date().toISOString().split('T')[0]}
                       />
                       <button
                         onClick={() => {
                           const respInput = document.getElementById('new-activity-responsible') as HTMLInputElement;
                           const dateInput = document.getElementById('new-activity-date') as HTMLInputElement;
                           if (!respInput.value) return;

                           const newActivity = {
                             id: Math.random().toString(36).substr(2, 9),
                             date: new Date().toISOString(),
                             responsible: respInput.value,
                             completionDate: dateInput.value
                           };

                           const updatedActivities = [...(selectedTerritory.activities || []), newActivity];
                           onSaveTerritory({ 
                             ...selectedTerritory, 
                             activities: updatedActivities,
                             responsiblePerson: respInput.value,
                             completionDate: dateInput.value,
                             updatedAt: new Date().toISOString()
                           });
                           
                           respInput.value = '';
                         }}
                         className="w-full py-2 bg-blue-600 text-white text-[10px] font-bold uppercase rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                       >
                         {t('map.addActivity')}
                       </button>
                    </div>

                    {selectedTerritory.activities && selectedTerritory.activities.length > 0 && (
                      <div className="space-y-2 mt-4 pt-4 border-t border-gray-200">
                        {selectedTerritory.activities.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(act => (
                          <div key={act.id} className="text-[10px] bg-white p-2 rounded border border-gray-100 shadow-sm relative group/act">
                            <button
                              onClick={() => {
                                if (window.confirm(t('messages.confirmDeleteActivity', 'Excluir este registro?'))) {
                                  const updatedActivities = selectedTerritory.activities?.filter(a => a.id !== act.id) || [];
                                  onSaveTerritory({ 
                                    ...selectedTerritory, 
                                    activities: updatedActivities, 
                                    updatedAt: new Date().toISOString() 
                                  });
                                }
                              }}
                              className="absolute top-1 right-1 opacity-0 group-hover/act:opacity-100 p-1 text-red-300 hover:text-red-500 transition-opacity"
                            >
                              <X size={10} />
                            </button>
                            <div className="flex justify-between font-bold text-gray-900 pr-5">
                              <span>{act.responsible}</span>
                              <span className="text-gray-400">{new Date(act.date).toLocaleDateString()}</span>
                            </div>
                            {act.completionDate && (
                              <div className="text-green-600 mt-0.5 flex items-center gap-1 font-medium">
                                <CheckCircle2 size={8} /> {t('fields.completed')}: {act.completionDate}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 space-y-2 border-t border-gray-100">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><Clock size={10} /> {t('fields.created')}</span>
                    <span>{selectedTerritory.createdAt ? new Date(selectedTerritory.createdAt).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><Clock size={10} /> {t('fields.updated')}</span>
                    <span>{selectedTerritory.updatedAt ? new Date(selectedTerritory.updatedAt).toLocaleDateString() : 'N/A'}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onDeleteTerritory(selectedTerritory.id);
                    setSelectedTerritoryId(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-600 border border-red-200 rounded-md hover:bg-red-50 transition-colors mt-8"
                >
                  <Trash2 size={16} />
                  <span>{t('fields.deleteTerritory')}</span>
                </button>
              </motion.div>
            ) : sidebarTab === 'activity' ? (
              <div className="h-full flex flex-col p-4 space-y-4 overflow-y-auto">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={exportActivitiesPDF}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-bold border border-red-100"
                  >
                    <FileText size={14} />
                    <span>{t('map.exportPDF')}</span>
                  </button>
                  <button
                    onClick={exportActivitiesExcel}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors text-xs font-bold border border-green-100"
                  >
                    <Download size={14} />
                    <span>{t('map.exportExcel')}</span>
                  </button>
                </div>
                <div className="space-y-3">
                  {[...territories]
                    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
                    .map(terr => (
                      <div 
                        key={terr.id} 
                        className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
                        onClick={() => setSelectedTerritoryId(terr.id)}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg border-2 border-current" style={{ color: terr.color }}>
                              {terr.number}
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{terr.name}</h4>
                              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <Clock size={10} /> {terr.updatedAt ? new Date(terr.updatedAt).toLocaleString() : 'Recentemente'}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="pt-3 border-t border-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                              <User size={12} />
                            </div>
                            <span className="text-xs font-medium text-gray-600">
                              {terr.responsiblePerson || t('fields.notAssigned')}
                            </span>
                          </div>
                          {terr.completionDate && (
                            <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-600 rounded-full font-black uppercase tracking-tighter">
                              {t('fields.completed')}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                  {territories.length === 0 && (
                    <div className="py-20 text-center space-y-4 opacity-50">
                      <Activity size={48} className="mx-auto text-gray-300" />
                      <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t('fields.noActivity')}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : sidebarTab === 'areas' ? (
              <div className="h-full flex flex-col p-4 space-y-6 overflow-y-auto">
                <div className="space-y-4">
                  {groups.map(g => (
                    <div key={g.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3 group/item">
                      <div className="relative">
                        <input 
                          type="color" 
                          value={g.color} 
                          onChange={(e) => onSaveGroup({ ...g, color: e.target.value })}
                          className="w-8 h-8 rounded-full border-2 border-white shadow-sm overflow-hidden cursor-pointer bg-transparent"
                        />
                        <div className="absolute inset-0 rounded-full border border-black/5 pointer-events-none" />
                      </div>
                      <input 
                        type="text" 
                        value={g.name} 
                        onChange={(e) => onSaveGroup({ ...g, name: e.target.value })}
                        className="flex-1 bg-transparent text-sm font-bold focus:outline-none placeholder:text-gray-300"
                        placeholder={t('fields.areaName')}
                      />
                      <button
                        onClick={() => {
                          if (window.confirm(t('messages.confirmDeleteArea'))) {
                            onDeleteGroup(g.id);
                          }
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => onSaveGroup({ id: `new-${Date.now()}`, name: t('map.new'), color: '#ffffff', mapId: '' })}
                    className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm font-medium hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={16} />
                    <span>{t('fields.addNewArea')}</span>
                  </button>
                </div>

                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 space-y-4 pt-12 border-t border-gray-100">
                  <div className="p-4 bg-gray-50 rounded-full">
                    <Layers size={32} />
                  </div>
                  <p className="text-sm px-4">{t('fields.areaHint')}</p>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col p-4 space-y-4 overflow-y-auto">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="text"
                    placeholder={t('fields.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-black outline-none"
                  />
                </div>

                <div className="space-y-2">
                  {territories
                    .filter(terr => {
                      const searchLower = searchQuery.toLowerCase();
                      const matchesName = terr.name.toLowerCase().includes(searchLower);
                      const matchesNumber = terr.number.toString().includes(searchQuery);
                      
                      if (matchesName || matchesNumber) return true;
                      
                      if (terr.groupId) {
                        const group = groups.find(g => g.id === terr.groupId);
                        return group?.name.toLowerCase().includes(searchLower);
                      }
                      
                      return false;
                    })
                    .sort((a, b) => a.number - b.number)
                    .map(terr => {
                      const group = groups.find(g => g.id === terr.groupId);
                      return (
                        <button
                          key={terr.id}
                          onClick={() => {
                            setSelectedTerritoryId(terr.id);
                            // Optionally center map on territory
                            const centroid = getCentroid(terr.points);
                            if (centroid && mapRef.current) {
                              // We don't have direct access to map instance easily here without ref or custom hook
                              // But selecting it will highlight it.
                            }
                          }}
                          className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all group ${
                            selectedTerritoryId === terr.id 
                              ? 'bg-black border-black text-white shadow-lg' 
                              : 'bg-white border-gray-100 hover:border-gray-300 text-gray-900'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm border-2 border-current">
                              {terr.number}
                            </div>
                            <div className="text-left">
                              <p className="font-bold text-sm leading-tight">{terr.name}</p>
                              {group && (
                                <p className={`text-[10px] font-black uppercase tracking-wider ${selectedTerritoryId === terr.id ? 'text-gray-400' : 'text-gray-400'}`}>
                                  {group.name}
                                </p>
                              )}
                            </div>
                          </div>
                          <div 
                            className="w-3 h-3 rounded-full border border-black/10 shadow-sm" 
                            style={{ backgroundColor: terr.color }}
                          />
                        </button>
                      );
                    })}
                  
                  {territories.length === 0 && (
                    <div className="py-12 text-center space-y-4">
                      <div className="inline-flex p-4 bg-gray-50 rounded-full text-gray-300">
                        <MapIcon size={32} />
                      </div>
                      <p className="text-sm text-gray-400 font-medium">{t('fields.noActivity')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
        )}
        </AnimatePresence>
      </div>
    </APIProvider>
  );
};
