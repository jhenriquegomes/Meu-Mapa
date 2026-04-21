/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { MapEditor } from './components/MapEditor';
import { Territory, TerritoryGroup, MapData, MapProvider } from './types';
import { auth, db, signIn, signOut, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import { LogIn, LogOut, Map as MapIcon, X, Settings as SettingsIcon, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [groups, setGroups] = useState<TerritoryGroup[]>([]);
  const [activeMap, setActiveMap] = useState<MapData | null>(null);
  const [mapProvider, setMapProvider] = useState<MapProvider>('google');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch or create a default map for the user
  useEffect(() => {
    if (!user) return;

    const mapsRef = collection(db, 'maps');
    const q = query(mapsRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // Create a default map if none exists
        const newMap = {
          title: 'My First Map',
          description: 'Default project map',
          userId: user.uid,
          createdAt: new Date().toISOString()
        };
        addDoc(mapsRef, newMap).catch(err => handleFirestoreError(err, OperationType.CREATE, 'maps'));
      } else {
        const mapData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as MapData;
        setActiveMap(mapData);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'maps'));

    return unsubscribe;
  }, [user]);

  // Fetch territories for the active map
  useEffect(() => {
    if (!activeMap) return;

    const territoriesRef = collection(db, `maps/${activeMap.id}/territories`);
    const unsubscribe = onSnapshot(territoriesRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Territory));
      setTerritories(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `maps/${activeMap.id}/territories`));

    return unsubscribe;
  }, [activeMap]);

  // Fetch groups for the active map
  useEffect(() => {
    if (!activeMap) return;

    const groupsRef = collection(db, `maps/${activeMap.id}/groups`);
    const unsubscribe = onSnapshot(groupsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TerritoryGroup));
      setGroups(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `maps/${activeMap.id}/groups`));

    return unsubscribe;
  }, [activeMap]);

  const handleSaveTerritory = async (territory: Territory) => {
    if (!activeMap) return;
    try {
      const territoryWithTimestamp = {
        ...territory,
        updatedAt: new Date().toISOString()
      };

      // Use the provided ID as the document path to stay consistent during save/delete
      const docRef = doc(db, `maps/${activeMap.id}/territories`, territory.id);
      const { id, ...data } = territoryWithTimestamp;
      
      // If it's a new territory, ensure createdAt is set
      const territoryData = {
        ...data,
        mapId: activeMap.id,
        createdAt: data.createdAt || new Date().toISOString()
      };

      await setDoc(docRef, territoryData, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `maps/${activeMap.id}/territories`);
    }
  };

  const handleDeleteTerritory = async (id: string) => {
    if (!activeMap) return;
    console.log(`Attempting to delete territory: ${id} on map: ${activeMap.id}`);
    try {
      await deleteDoc(doc(db, `maps/${activeMap.id}/territories`, id));
      console.log(`Successfully deleted territory: ${id}`);
    } catch (err) {
      console.error(`Failed to delete territory: ${id}`, err);
      handleFirestoreError(err, OperationType.DELETE, `maps/${activeMap.id}/territories/${id}`);
    }
  };

  const handleClearAllTerritories = async () => {
    if (!activeMap || territories.length === 0) return;
    
    // We loop through and delete because mass deletion is not a single call in Firestore client
    const promises = territories.map(t => 
      deleteDoc(doc(db, `maps/${activeMap.id}/territories`, t.id))
    );
    
    try {
      await Promise.all(promises);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `maps/${activeMap.id}/territories`);
    }
  };

  const handleSaveGroup = async (group: TerritoryGroup) => {
    if (!activeMap) return;
    try {
      const docRef = doc(db, `maps/${activeMap.id}/groups`, group.id);
      const { id, ...data } = group;
      await setDoc(docRef, { ...data, mapId: activeMap.id }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `maps/${activeMap.id}/groups`);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!activeMap) return;
    console.log(`Attempting to delete group: ${id} on map: ${activeMap.id}`);
    try {
      await deleteDoc(doc(db, `maps/${activeMap.id}/groups`, id));
      console.log(`Successfully deleted group: ${id}`);
    } catch (err) {
      console.error(`Failed to delete group: ${id}`, err);
      handleFirestoreError(err, OperationType.DELETE, `maps/${activeMap.id}/groups/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#F8F9FA] p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-8 border border-gray-100">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-white shadow-lg">
              <MapIcon size={32} />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Territory Mapper</h1>
            <p className="text-gray-500">Sign in to start creating and managing your custom maps.</p>
          </div>
          <button
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-black text-white rounded-xl font-semibold hover:bg-gray-800 transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
          >
            <LogIn size={20} />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FA]">
      <Header user={user} onSignOut={signOut} onOpenSettings={() => setIsSettingsOpen(true)} />
      <main className="flex-1 p-2 md:p-6 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-4 md:gap-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="hidden sm:block">
              <h2 className="text-2xl font-bold text-gray-900">Meu Mapa</h2>
            </div>
            <div className="flex justify-between items-center w-full sm:w-auto gap-3">
              <div className="flex sm:hidden">
                <h2 className="text-lg font-bold text-gray-900">Meu Mapa</h2>
              </div>
              <div className="flex gap-3">
                <div className="flex -space-x-2">
                  {['#3B82F6', '#EF4444', '#10B981'].map((c, i) => (
                    <div key={i} className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <span className="text-xs sm:text-sm font-medium text-gray-400 self-center">
                    {territories.length} Territories
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-h-0">
            <MapEditor
              territories={territories}
              groups={groups}
              onSaveTerritory={handleSaveTerritory}
              onDeleteTerritory={handleDeleteTerritory}
              onClearAllTerritories={handleClearAllTerritories}
              onSaveGroup={handleSaveGroup}
              onDeleteGroup={handleDeleteGroup}
              mapProvider={mapProvider}
            />
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <SettingsIcon size={20} className="text-gray-600" />
                  </div>
                  <h2 className="text-xl font-bold">Settings</h2>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-8">
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-bold text-gray-900">Map Provider</h3>
                    <p className="text-sm text-gray-500">Choose the underlying map technology.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setMapProvider('google')}
                      className={`relative p-4 rounded-xl border-2 transition-all flex flex-col gap-3 text-left ${
                        mapProvider === 'google' 
                        ? 'border-black bg-gray-50' 
                        : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      {mapProvider === 'google' && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-black text-white rounded-full flex items-center justify-center">
                          <Check size={12} />
                        </div>
                      )}
                      <div className="p-2 bg-white rounded-lg w-fit shadow-sm border border-gray-100">
                        <img src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_92x30dp.png" alt="Google" className="h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">Google Maps</p>
                        <p className="text-[10px] text-gray-400 leading-tight">High detail, street view & dynamic styling.</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setMapProvider('osm')}
                      className={`relative p-4 rounded-xl border-2 transition-all flex flex-col gap-3 text-left ${
                        mapProvider === 'osm' 
                        ? 'border-black bg-gray-50' 
                        : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      {mapProvider === 'osm' && (
                        <div className="absolute top-3 right-3 w-5 h-5 bg-black text-white rounded-full flex items-center justify-center">
                          <Check size={12} />
                        </div>
                      )}
                      <div className="p-2 bg-white rounded-lg w-fit shadow-sm border border-gray-100">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Openstreetmap_logo.svg/1200px-Openstreetmap_logo.svg.png" alt="OSM" className="h-4" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">OpenStreetMap</p>
                        <p className="text-[10px] text-gray-400 leading-tight">Free, community-driven & reliable baseline.</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                   <p className="text-xs text-blue-700 leading-relaxed font-medium">
                     <b>Note:</b> Territories are saved to your account and will persist regardless of which map provider you choose.
                   </p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-all text-sm"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
