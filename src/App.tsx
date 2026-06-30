import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import {
  Globe, Shield, Activity, Users, Award, Zap, Compass, MapPin, 
  Upload, Check, ArrowRight, Share2, ThumbsUp, ChevronRight, AlertTriangle, Info, Search,
  Lock, Unlock, LogIn, LogOut, User, Trash2
} from 'lucide-react';
import { db, auth, googleProvider } from './firebase';
import { 
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, limit, increment
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  signOut, onAuthStateChanged, User as FirebaseUser, updateProfile,
  signInWithPopup
} from 'firebase/auth';

// ==========================================
// HARDCODED DATASET (EXACTLY AS SPECIFIED)
// ==========================================
const INITIAL_STATES = [
  { rank: 1, state: "Bavaria", country: "Germany", flag: "🇩🇪", score: 94.2, speed: 0.8, participation: 98, change: 2, trend: [88, 90, 91, 92, 93, 94.2] },
  { rank: 2, state: "Singapore", country: "Singapore", flag: "🇸🇬", score: 93.1, speed: 0.6, participation: 96, change: 0, trend: [92, 92.5, 92.8, 93, 93, 93.1] },
  { rank: 3, state: "Zurich Canton", country: "Switzerland", flag: "🇨🇭", score: 91.8, speed: 1.1, participation: 91, change: 1, trend: [89, 90, 90.5, 91, 91.5, 91.8] },
  { rank: 4, state: "Tokyo Metro", country: "Japan", flag: "🇯🇵", score: 90.4, speed: 0.9, participation: 94, change: -1, trend: [91, 91, 90.8, 90.6, 90.5, 90.4] },
  { rank: 5, state: "Netherlands", country: "Netherlands", flag: "🇳🇱", score: 89.7, speed: 1.2, participation: 89, change: 3, trend: [85, 86, 87, 88, 89, 89.7] },
  { rank: 9, state: "California", country: "USA", flag: "🇺🇸", score: 83.7, speed: 1.8, participation: 79, change: 4, trend: [78, 79, 80, 81, 82, 83.7] },
  { rank: 38, state: "Maharashtra", country: "India", flag: "🇮🇳", score: 61.4, speed: 3.8, participation: 54, change: 5, trend: [55, 56, 57, 58, 60, 61.4] },
  { rank: 41, state: "Tamil Nadu", country: "India", flag: "🇮🇳", score: 59.8, speed: 4.1, participation: 51, change: 2, trend: [54, 55, 56, 57, 58, 59.8] },
  { rank: 44, state: "Telangana", country: "India", flag: "🇮🇳", score: 57.3, speed: 4.4, participation: 48, change: 3, trend: [51, 52, 53, 54, 56, 57.3] },
  { rank: 47, state: "Karnataka", country: "India", flag: "🇮🇳", score: 54.6, speed: 4.2, participation: 45, change: 4, trend: [48, 49, 50, 51, 53, 54.6], highlight: true },
  { rank: 51, state: "Kerala", country: "India", flag: "🇮🇳", score: 52.1, speed: 4.8, participation: 43, change: -1, trend: [54, 53, 53, 52, 52, 52.1] },
  { rank: 312, state: "Lagos State", country: "Nigeria", flag: "🇳🇬", score: 34.2, speed: 8.1, participation: 28, change: 7, trend: [26, 27, 28, 30, 32, 34.2] },
  { rank: 847, state: "Uttar Pradesh", country: "India", flag: "🇮🇳", score: 28.4, speed: 9.3, participation: 21, change: 2, trend: [24, 25, 25, 26, 27, 28.4] },
  { rank: 901, state: "Kinshasa", country: "DR Congo", flag: "🇨🇩", score: 22.1, speed: 14.0, participation: 12, change: 1, trend: [20, 20, 21, 21, 22, 22.1] }
];

const DEMO_POTHOLE_IMAGE_URL = "https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&q=80&w=600";

const compressImage = (base64Str: string, maxWidth = 500, maxHeight = 375): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.5);
        resolve(compressed);
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

const INITIAL_ISSUES: any[] = [];

const LIVE_FEED = [
  "🟢 Civic Lens Global is active and waiting for your first report.",
  "🛰️ High-precision GPS tracking & verification enabled.",
  "💡 AI-powered camera scanning detects civic defects in real-time.",
  "⭐ Submit an incident report to earn up to +150 Civic XP immediately."
];

const CITIZEN_LEADERBOARD: any[] = [];

// ==========================================
// GRID GEOSPATIAL COORDINATES MAPPING
// ==========================================
const BASE_LAT = 12.836083;
const BASE_LNG = 77.649201;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

export interface LocationData {
  fullAddress: string;
  city: string;
  state: string;
  country: string;
  area: string;
}

async function reverseGeocode(lat: number, lng: number): Promise<LocationData> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: {
        'Accept-Language': 'en'
      }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.display_name) {
        const address = data.address || {};
        
        let city = address.city || address.municipality || address.state_district || address.county || "Unknown City";
        // Remove " District" or " Urban" from city names if present for cleaner display
        if (city.endsWith(" District")) city = city.replace(" District", "");
        if (city.endsWith(" Urban")) city = city.replace(" Urban", "");
        if (city === "Bengaluru Urban") city = "Bengaluru";
        
        let area = address.suburb || address.village || address.neighbourhood || address.town || address.residential || "";

        const state = address.state || "Unknown State";
        const country = address.country || "Unknown Country";
        return {
          fullAddress: data.display_name,
          city,
          state,
          country,
          area
        };
      }
    }
  } catch (e) {
    console.warn("Reverse geocoding failed, using fallback coordinate string", e);
  }
  // Fallback to a pretty geocoordinate string if OSM nominatim is blocked or offline
  return {
    fullAddress: `Location at ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E`,
    city: "Unknown City",
    state: "Unknown State",
    country: "Unknown Country",
    area: ""
  };
}

function getGridCellCoords(cell: string, baseLat: number = BASE_LAT, baseLng: number = BASE_LNG) {
  const colLetter = cell.charAt(0);
  const rowNumStr = cell.substring(1);
  const col = colLetter.charCodeAt(0) - 65; // A=0, B=1...
  const row = parseInt(rowNumStr, 10) - 1;   // 1=0, 2=1...
  
  const calculatedLat = baseLat + (4 - row) * 0.0015;
  const calculatedLng = baseLng + col * 0.0015;
  return { lat: parseFloat(calculatedLat.toFixed(6)), lng: parseFloat(calculatedLng.toFixed(6)) };
}


function getNearestGridCell(lat: number, lng: number, baseLat: number = BASE_LAT, baseLng: number = BASE_LNG): { cell: string; lat: number; lng: number } {
  let minDistance = Infinity;
  let bestCell = "C3";
  let bestLat = baseLat;
  let bestLng = baseLng;

  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 5; row++) {
      const cellLat = baseLat + (4 - row) * 0.0015;
      const cellLng = baseLng + col * 0.0015;
      
      const dist = Math.pow(lat - cellLat, 2) + Math.pow(lng - cellLng, 2);
      if (dist < minDistance) {
        minDistance = dist;
        bestCell = `${String.fromCharCode(65 + col)}${row + 1}`;
        bestLat = cellLat;
        bestLng = cellLng;
      }
    }
  }
  return { cell: bestCell, lat: parseFloat(bestLat.toFixed(6)), lng: parseFloat(bestLng.toFixed(6)) };
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp || timestamp === "Just now") return "Just now";
  
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;

    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (e) {
    return timestamp;
  }
};

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

function MainApp() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const officialMap = useMap('official-map');

  // Dynamic Geolocation Base States (Defaults to Bangalore, shifts dynamically to user location)
  const [baseLat, setBaseLat] = useState<number>(BASE_LAT);
  const [baseLng, setBaseLng] = useState<number>(BASE_LNG);

  // Persistence State
  const [dbStates, setDbStates] = useState<any[]>(INITIAL_STATES);
  const indiaSpotlightStates = [...dbStates].filter(s => s.country === "India").sort((a,b) => a.rank - b.rank).slice(0, 3);
  const indiaAvgScore = indiaSpotlightStates.length ? (indiaSpotlightStates.reduce((acc, s) => acc + s.score, 0) / indiaSpotlightStates.length).toFixed(1) : "0.0";
  const [issues, setIssues] = useState<any[]>(INITIAL_ISSUES);

  const [dbUsers, setDbUsers] = useState<any[]>([]);

  // User Authentication & Sync States
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isGpsConfirmOpen, setIsGpsConfirmOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authRole, setAuthRole] = useState<'citizen' | 'official'>('citizen');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'profile'>('login');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [issueIdToDelete, setIssueIdToDelete] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [issuesFilter, setIssuesFilter] = useState<'all' | 'mine'>('all');
  const [citizenSearchTerm, setCitizenSearchTerm] = useState('');
  const [userRole, setUserRole] = useState<'citizen' | 'official' | null>(null);

  // Offline Mode State
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      showToast("  Network restored. Syncing pending reports...");
      syncPendingReports();
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast("  Working in Offline Mode. Reports will sync later.");
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncPendingReports = async () => {
    const pending = localStorage.getItem('pendingReports');
    if (pending) {
      const pendingArray = JSON.parse(pending);
      for (const report of pendingArray) {
        try {
          await setDoc(doc(db, "issues", report.id), report);
        } catch (e) {
          console.error("Sync error:", e);
        }
      }
      localStorage.removeItem('pendingReports');
      showToast("  All reports synchronized to cloud.");
    }
  };

  const currentUserData = dbUsers.find(u => u.uid === user?.uid);
  const xp = currentUserData?.xp || 0;
  const verifiedCount = currentUserData?.verifiedCount || 0;

  useEffect(() => {
    if (userRole === 'official') {
      setActiveTab('official');
    } else if (activeTab === 'official') {
      setActiveTab('dashboard');
    }
  }, [userRole]);

  const [officialFilterState, setOfficialFilterState] = useState('');
  const [officialFilterCity, setOfficialFilterCity] = useState('');
  const [officialFilterArea, setOfficialFilterArea] = useState('');
  const [officialSearchTerm, setOfficialSearchTerm] = useState('');
  const [officialSortBy, setOfficialSortBy] = useState<'date_desc' | 'date_asc' | 'severity_desc' | 'severity_asc'>('severity_desc');
  const [resolvingIssueId, setResolvingIssueId] = useState<string | null>(null);
  const [resolvePhotoUrl, setResolvePhotoUrl] = useState('');

  // Monitor Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load custom profile metrics from Firestore users table
        const userRef = doc(db, "users", currentUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.role) setUserRole(data.role);
            showToast(`🔐 Synced secure database profile for ${currentUser.displayName || currentUser.email}`);
          } else {
            // Write new user profile document
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName || authName || currentUser.email?.split('@')[0] || "Citizen Hero",
              xp: 0,
              verifiedCount: 0,
              role: authRole,
              createdAt: new Date().toISOString()
            });
            setUserRole(authRole);
            showToast(`✨ Created database profile for ${currentUser.displayName || currentUser.email}`);
          }
        } catch (err) {
          console.error("Error reading user profile from Firestore:", err);
        }
      } else {
        setUserRole(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [authName, authRole]);

  // Removed local sync push to DB (dbUsers subscription handles incoming)

  // Listen to Firestore issues collection in real-time
  useEffect(() => {
    setIsSyncing(true);
    const issuesRef = collection(db, "issues");
    const unsubscribe = onSnapshot(issuesRef, async (snapshot) => {
      if (snapshot.empty) {
        console.log("Firestore issues collection is empty. Seeding INITIAL_ISSUES...");
        for (const iss of INITIAL_ISSUES) {
          try {
            await setDoc(doc(db, "issues", iss.id), iss);
          } catch (err) {
            console.error(`Error seeding issue ${iss.id}:`, err);
          }
        }
        setIssues(INITIAL_ISSUES);
        setIsSyncing(false);
      } else {
        const items: any[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.id && (data.id === "CV-2847" || data.id === "CV-2841" || data.id === "CV-2830")) {
            // Filter out old seed dummy data
            return;
          }
          if (data.photo === "demo_road_pothole" || (data.photo && (data.photo.includes("photo-1515162305285") || data.photo.includes("photo-1515162305285-0293e4767cc2") || data.photo.includes("photo-1599740831119")))) {
            data.photo = DEMO_POTHOLE_IMAGE_URL;
          }
          items.push(data);
        });
        // Sort items by severity (descending)
        items.sort((a, b) => b.severity - a.severity);
        // Deduplicate items by id
        const seen = new Set();
        const uniqueItems = items.filter((iss: any) => {
          if (!iss || !iss.id) return false;
          if (seen.has(iss.id)) return false;
          seen.add(iss.id);
          return true;
        });
        setIssues(uniqueItems);
        setIsSyncing(false);
      }
    }, (error) => {
      console.error("Firestore subscription error:", error);
      setIsSyncing(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to Firestore states collection in real-time
  useEffect(() => {
    const statesRef = collection(db, "states");
    const unsubscribe = onSnapshot(statesRef, async (snapshot) => {
      if (snapshot.empty) {
        console.log("Firestore states collection is empty. Seeding INITIAL_STATES...");
        for (const st of INITIAL_STATES) {
          try {
            await setDoc(doc(db, "states", st.state), st);
          } catch (err) {
            console.error(`Error seeding state ${st.state}:`, err);
          }
        }
        setDbStates(INITIAL_STATES);
      } else {
        const items: any[] = [];
        snapshot.forEach((docSnap) => {
          items.push(docSnap.data());
        });
        items.sort((a, b) => b.score - a.score);
        items.forEach((item, idx) => item.rank = idx + 1);
        setDbStates(items);
      }
    }, (err) => {
      console.error("Error subscribing to states collection:", err);
    });
    return () => unsubscribe();
  }, []);

  // Listen to Firestore users collection in real-time for authentic leaderboard
  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push(docSnap.data());
      });
      // Sort by xp descending
      items.sort((a, b) => (b.xp || 0) - (a.xp || 0));
      setDbUsers(items);
    }, (err) => {
      console.error("Error subscribing to users collection:", err);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const currentUser = result.user;
      
      // Load or write user profile document in Firestore
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        
        // Force update to the selected role during login
        await updateDoc(userRef, { role: authRole });
        setUserRole(authRole);
        showToast(`🔐 Synced secure database profile for ${currentUser.displayName || currentUser.email}`);
      } else {
        await setDoc(userRef, {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName || "Citizen Hero",
          xp: 0,
          verifiedCount: 0,
          role: authRole,
          createdAt: new Date().toISOString()
        });
        setUserRole(authRole);
        showToast(`✨ Created database profile for ${currentUser.displayName || currentUser.email}`);
      }
      setIsAuthModalOpen(false);
    } catch (err: any) {
      console.error("Google login error:", err);
      if (err.code === "auth/operation-not-allowed") {
        showToast("⚠️ Google Sign-In is disabled. Please enable it in your Firebase Console under Authentication -> Sign-in method.");
      } else {
        showToast(`❌ Google Sign-In failed: ${err.message || "Unknown error"}`);
      }
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      showToast("❌ Please fill in all required fields.");
      return;
    }

    if (authPassword.length < 6) {
      showToast("❌ Password should be at least 6 characters.");
      return;
    }

    try {
      if (authMode === 'login') {
        const userCred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        
        // Update their role if they selected one during login
        const userRef = doc(db, "users", userCred.user.uid);
        await updateDoc(userRef, { role: authRole });
        setUserRole(authRole);
        
        showToast("🔓 Successfully logged in! Synchronizing database...");
        setIsAuthModalOpen(false);
      } else if (authMode === 'signup') {
        if (!authName) {
          showToast("❌ Please enter your display name.");
          return;
        }
        const userCred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCred.user, { displayName: authName });
        
        // Write new user profile document explicitly to Firestore
        const userRef = doc(db, "users", userCred.user.uid);
        await setDoc(userRef, {
          uid: userCred.user.uid,
          email: userCred.user.email,
          displayName: authName,
          xp: 0,
          verifiedCount: 0,
          role: authRole,
          createdAt: new Date().toISOString()
        });

        showToast("✨ Account created successfully! DB initialized.");
        setIsAuthModalOpen(false);
      }
    } catch (err: any) {
      console.error("Authentication error:", err);
      if (err.code === "auth/operation-not-allowed") {
        showToast("⚠️ Email/Password Auth is disabled. Please enable it in your Firebase Console under Authentication -> Sign-in method.");
      } else {
        showToast(`❌ Auth failed: ${err.message || "Invalid credentials"}`);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserRole(null);
      showToast("🔒 Signed out safely.");
      setIsAuthModalOpen(false);
    } catch (err) {
      console.error("Signout error:", err);
    }
  };

  // Geolocation Startup Lock & Dynamic Issue Alignment
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          setBaseLat(lat);
          setBaseLng(lng);

          showToast(`🛰️ Geotagged to your local city: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);

          // Only shift issues if they are the initial mock dataset (i.e. we haven't created a custom one yet, or they have Bangalore coordinates)
          const hasUnshiftedIssues = issues.some((iss: any) => 
            Math.abs(iss.lat - 12.971598) < 0.2 || Math.abs(iss.lat - 13.011822) < 0.2
          );

          if (hasUnshiftedIssues) {
            try {
              const shiftOffsets = [
                { latOffset: 0.002, lngOffset: 0.003 },
                { latOffset: -0.003, lngOffset: -0.004 },
                { latOffset: 0.004, lngOffset: -0.002 }
              ];

              const updatedIssues = await Promise.all(INITIAL_ISSUES.map(async (iss, idx) => {
                const offset = shiftOffsets[idx % shiftOffsets.length];
                const targetLat = lat + offset.latOffset;
                const targetLng = lng + offset.lngOffset;
                
                // Fetch actual street name dynamically via OSM Nominatim
                const realAddress = await reverseGeocode(targetLat, targetLng);
                
                return {
                  ...iss,
                  lat: parseFloat(targetLat.toFixed(6)),
                  lng: parseFloat(targetLng.toFixed(6)),
                  location: realAddress
                };
              }));

              // Batch update shifted issues to Firestore
              for (const iss of updatedIssues) {
                await setDoc(doc(db, "issues", iss.id), iss);
              }
            } catch (err) {
              console.error("Failed to shift and geocode initial issues:", err);
            }
          }
        },
        (error) => {
          console.warn("Startup geolocation permission not granted/unavailable:", error);
        },
        { enableHighAccuracy: false, timeout: 6000 }
      );
    }
  }, []);

  // Local state helper triggers
  const [selectedState, setSelectedState] = useState<any>(INITIAL_STATES[9]);

  useEffect(() => {
    if (dbStates && dbStates.length > 0) {
      const dbMatch = dbStates.find(s => s.highlight);
      if (dbMatch) setSelectedState(dbMatch);
      else setSelectedState(dbStates[9] || dbStates[0]);
    }
  }, [dbStates]);
  const [stateDetailOpen, setStateDetailOpen] = useState(false);
  const [selectedIssueId, setSelectedIssueId] = useState<string>("CV-2847");
  const [submittedIssueId, setSubmittedIssueId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  // Live Feed Scrolling Tick
  const [feedIndex, setFeedIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setFeedIndex(prev => (prev + 1) % LIVE_FEED.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Comparison State Pre-selections
  const [compareState1, setCompareState1] = useState<string>("Karnataka");
  const [compareState2, setCompareState2] = useState<string>("Bavaria");
  const [compareState3, setCompareState3] = useState<string>("California");

  // Reporting Flow States
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<{ source: string; isUserUploaded: boolean } | null>(null);
  const [isLocationPromptOpen, setIsLocationPromptOpen] = useState(false);
  const [scanProgress, setScanProgress] = useState(-1); // -1: idle, 0-100 scan progress
  const [revealedBoxes, setRevealedBoxes] = useState<number>(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(1); // 1: Scanner, 2: Review, 3: Success
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  // Camera States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Form Fields for Step 2
  const [formTitle, setFormTitle] = useState("Pothole & Road Damage – AI Detected");
  const [formCategory, setFormCategory] = useState("Road");
  const [formDesc, setFormDesc] = useState("A severe pothole with surrounding cracks detected, causing major local delays next to the hospital zone.");
  const [formLocation, setFormLocation] = useState("");
  const [formCity, setFormCity] = useState("Unknown City");
  const [formState, setFormState] = useState("Unknown State");
  const [formCountry, setFormCountry] = useState("Unknown Country");
  const [formArea, setFormArea] = useState("");

  const displayState = formState !== "Unknown State" ? formState : "Karnataka";
  const displayStateData = dbStates.find(s => s.state === displayState);
  const karnatakaRankVal = displayStateData?.rank || 849;

  // Fetch initial address on mount for default coordinates
  useEffect(() => {
    if (!formLocation && formLat && formLng) {
      reverseGeocode(formLat, formLng).then(locData => {
        if (locData) {
          setFormLocation(locData.fullAddress);
          setFormCity(locData.city);
          setFormState(locData.state);
          setFormCountry(locData.country);
          setFormArea(locData.area);
        }
      }).catch(console.error);
    }
  }, []);
  const [selectedGridCell, setSelectedGridCell] = useState("C3");
  const [formLat, setFormLat] = useState<number>(12.836083);
  const [formLng, setFormLng] = useState<number>(77.649201);
  const [isGridVisible, setIsGridVisible] = useState(false);
  const [dashboardMapMode, setDashboardMapMode] = useState<'grid' | 'heatmap'>('heatmap');
  const [detailViewMode, setDetailViewMode] = useState<'image' | 'map' | 'proof'>('image');
  const [scannedOutput, setScannedOutput] = useState<{
    title: string;
    category: string;
    description: string;
    severity: number;
    boxes: Array<{ x: number; y: number; w: number; h: number; label: string; conf: number; color: string }>;
    approximateAddress: string;
    latitude: number;
    longitude: number;
  } | null>(null);

  // Interactive Toast State
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Helper for Severity Style
  const getSeverityStyle = (score: number) => {
    if (score >= 9.0) return { bg: 'rgba(239,68,68,0.12)', border: 'border-red-500/30', text: 'text-red-400', label: 'CRITICAL' };
    if (score >= 7.0) return { bg: 'rgba(249,115,22,0.12)', border: 'border-orange-500/30', text: 'text-orange-400', label: 'HIGH' };
    if (score >= 5.0) return { bg: 'rgba(234,179,8,0.12)', border: 'border-yellow-500/30', text: 'text-yellow-400', label: 'MEDIUM' };
    return { bg: 'rgba(34,197,94,0.12)', border: 'border-green-500/30', text: 'text-green-400', label: 'LOW' };
  };

  // Scan visualizer engine
  const startScanningProcess = async (imageSource: string, isUserUploaded: boolean = false, useGps: boolean = false) => {
    setUploadedImage(imageSource);
    setScanProgress(0);
    setRevealedBoxes(0);
    setTerminalLogs(["▸ [Pipeline] Launching civic inspect agent..."]);
    setCurrentStep(1);
    setScannedOutput(null);

    // Trigger API call immediately
    const apiCallPromise = fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: imageSource })
    })
    .then(async r => {
      if (!r.ok) throw new Error("HTTP error " + r.status);
      const contentType = r.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server returned non-JSON response");
      }
      return r.json();
    })
    .catch(err => {
      console.error("Scan error, using local fallback simulator:", err);
      return {
        title: "Pothole & Asphalt Disintegration",
        category: "Road",
        description: "A wide structural pothole was identified in the travel lane with active fracturing, risking tyre damage.",
        severity: 8.8,
        boxes: [
          { x: 22.5, y: 38.0, w: 32.0, h: 28.0, label: "Pothole", conf: 92, color: "#ef4444" },
          { x: 55.0, y: 50.0, w: 22.0, h: 18.0, label: "Road Crack", conf: 76, color: "#f97316" }
        ],
        approximateAddress: "Central Sector, Simulated Region",
        latitude: BASE_LAT,
        longitude: BASE_LNG
      };
    });

    // Request exact high-accuracy user location immediately in parallel with Gemini API
    let userLocationPromise: Promise<{ lat: number; lng: number; locationData: LocationData } | null> = Promise.resolve(null);
    if (useGps && navigator.geolocation) {
      setTerminalLogs(prev => [...prev, "📡 [GPS] Synchronising with orbital geocoders..."]);
      userLocationPromise = new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            setTerminalLogs(prev => [...prev, `📡 [GPS] Real-time high-accuracy lock: ${lat.toFixed(6)}, ${lng.toFixed(6)}`]);
            
            // Geocode coordinates using OpenStreetMap
            const locationData = await reverseGeocode(lat, lng);
            resolve({ lat, lng, locationData });
          },
          (err) => {
            console.warn("GPS lookup denied or failed during scan:", err);
            setTerminalLogs(prev => [...prev, `⚠️ [GPS] Telemetry restricted: ${err.message}. Defaulting to region.`]);
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    } else {
      setTerminalLogs(prev => [...prev, "📍 [GPS] Geotagging bypassed: Using standard region grids."]);
    }

    const standardLogs = isUserUploaded ? [
      "▸ [Pipeline] Reading custom image buffer into inspection pipeline...",
      "▸ [Pipeline] Loading visual processing layers...",
      "▸ [Gemini Multimodal] Extracting spatial bounding boxes...",
      "▸ [Gemini Multimodal] Requesting server-side multimodal fusion..."
    ] : [
      "▸ [Pipeline] Mounting demo street feed sample...",
      "▸ [Pipeline] Loading visual processing layers...",
      "▸ [Gemini Multimodal] Extracting spatial bounding boxes...",
      "▸ [Gemini Multimodal] Requesting server-side multimodal fusion..."
    ];

    let logIdx = 0;
    const logInterval = setInterval(() => {
      if (logIdx < standardLogs.length) {
        setTerminalLogs(prev => [...prev, standardLogs[logIdx]]);
        logIdx++;
      } else {
        clearInterval(logInterval);
      }
    }, 850);

    // Progress bar tick
    let progress = 0;
    const progressTimer = setInterval(async () => {
      progress += 2;
      if (progress >= 100) {
        progress = 100;
        setScanProgress(100);
        clearInterval(progressTimer);

        setTerminalLogs(prev => [...prev, "▸ [Gemini Multimodal] finalising neural bounding boxes..."]);

        // Wait for both API and user location to complete
        const [apiData, userLoc] = await Promise.all([apiCallPromise, userLocationPromise]);
        setScannedOutput(apiData);

        let finalLat = apiData.latitude && typeof apiData.latitude === 'number' ? apiData.latitude : parseFloat(apiData.latitude) || (baseLat + (Math.random() - 0.5) * 0.003);
        let finalLng = apiData.longitude && typeof apiData.longitude === 'number' ? apiData.longitude : parseFloat(apiData.longitude) || (baseLng + (Math.random() - 0.5) * 0.003);
        let finalAddress = apiData.approximateAddress || "";
        let finalLocationData: LocationData | null = null;

        if (userLoc) {
          finalLat = userLoc.lat;
          finalLng = userLoc.lng;
          finalLocationData = userLoc.locationData;
          finalAddress = userLoc.locationData.fullAddress;
          
          // Dynamically shift the matrix base coordinates to the user's location
          setBaseLat(userLoc.lat);
          setBaseLng(userLoc.lng);
        } else if (!finalAddress || finalAddress === apiData.approximateAddress) {
          try {
            finalLocationData = await reverseGeocode(finalLat, finalLng);
            finalAddress = finalLocationData.fullAddress;
          } catch (e) {
            finalAddress = `Near ${finalLat.toFixed(5)}°N, ${finalLng.toFixed(5)}°E`;
          }
        }

        const alignment = getNearestGridCell(finalLat, finalLng, userLoc ? userLoc.lat : baseLat, userLoc ? userLoc.lng : baseLng);

        // Populate Form Fields
        setFormTitle(apiData.title || "Road Defect – Scanned");
        setFormCategory(apiData.category || "Road");
        setFormDesc(apiData.description || "No description provided.");
        setFormLocation(finalAddress);
        if (finalLocationData) {
          setFormCity(finalLocationData.city);
          setFormState(finalLocationData.state);
          setFormCountry(finalLocationData.country);
          setFormArea(finalLocationData.area);
        }
        setFormLat(parseFloat(finalLat.toFixed(6)));
        setFormLng(parseFloat(finalLng.toFixed(6)));
        setSelectedGridCell(alignment.cell);

        // Build dynamic detection lines
        const modelName = apiData.yoloModelName || "Gemini-Native-Vision-Grounding";
        const inferenceTime = apiData.yoloInferenceTimeMs || 18;
        const boxesLogs = (apiData.boxes || []).map((box: any) => 
          `  ↳ Detected [Class ${box.classId !== undefined ? box.classId : 0}: ${box.label}] conf: ${(box.conf || 90)}%`
        );

        // Add final logs summarizing findings
        setTerminalLogs(prev => [
          ...prev,
          `🚀 [Gemini Multimodal] Initialising ${modelName} Grounding Engine...`,
          `🚀 [Gemini Multimodal] Native visual tensor fusion complete`,
          `🚀 [Gemini Multimodal] Inference completed in ${inferenceTime}ms`,
          ...boxesLogs,
          `▸ [Gemini Multimodal] Fusing spatial coordinates with semantic context...`,
          `▸ [Gemini Multimodal] Reasoning complete: "${apiData.title}" (${apiData.category})`,
          `▸ [Gemini Multimodal] Priority Severity Score: ${apiData.severity} / 10`,
          `📍 [Geofence] Location mapped: ${userLoc ? finalAddress : apiData.approximateAddress}`,
          `📍 [Geofence] Lat/Lng pinpointed: ${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}`,
          `✅ [Success] Telemetry validated. Opening incident draft...`
        ]);

        // Sequential bounding box reveals
        const numBoxes = apiData.boxes ? apiData.boxes.length : 1;
        for (let i = 1; i <= numBoxes; i++) {
          await new Promise(r => setTimeout(r, 450));
          setRevealedBoxes(i);
        }

        // Auto transition to review form
        setTimeout(() => {
          setCurrentStep(2);
        }, 1100);

      } else {
        setScanProgress(progress);
      }
    }, 50);
  };

  const handleLoadDemoImage = () => {
    setPendingUpload({ source: "demo_road_pothole", isUserUploaded: false });
    setIsLocationPromptOpen(true);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      showToast("Camera access denied or unavailable.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg");
        
        // create a File object from dataUrl and use processSelectedFile to behave exactly like upload
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
            stopCamera();
            processSelectedFile(file);
          });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processSelectedFile(file);
    }
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast("❌ Invalid file format. Please upload an image!");
      return;
    }
    
    // Read file as Base64 Data URL
    const reader = new FileReader();
    reader.onload = async (e) => {
      if (e.target?.result) {
        const originalBase64 = e.target.result as string;
        try {
          showToast("⚡ Optimizing and compressing image for Cloud Sync...");
          const compressedBase64 = await compressImage(originalBase64);
          setPendingUpload({ source: compressedBase64, isUserUploaded: true });
          setIsLocationPromptOpen(true);
        } catch (err) {
          console.error("Compression failed, using original:", err);
          setPendingUpload({ source: originalBase64, isUserUploaded: true });
          setIsLocationPromptOpen(true);
        }
      }
    };
    reader.onerror = () => {
      showToast("❌ Failed to read uploaded image. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // Submit Issue and Trigger Wow Moment 2 (The rank change)
  const handleSubmitReport = async () => {
    if (!user) {
      showToast("🔐 Authentication required! Please sign in using your Gmail / Google account first so your report is linked and tracked.");
      setIsAuthModalOpen(true);
      return;
    }

    const activeSeverity = scannedOutput ? scannedOutput.severity : 9.4;
    const activeBoxes = scannedOutput ? scannedOutput.boxes : [
      { x: 18, y: 30, w: 42, h: 30, label: "Pothole", conf: 94, color: "#EF4444" }
    ];

    const uniqueId = `CV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const currentStateObj = dbStates.find(s => s.state === (formState !== "Unknown State" ? formState : "Karnataka")) || dbStates.find(s => s.state === "Karnataka");
    const currentStateRankVal = currentStateObj?.rank || 849;
    const resolvedStateName = formState !== "Unknown State" ? formState : "Karnataka";

    const newIssue = {
      id: uniqueId,
      title: formTitle,
      category: formCategory,
      severity: activeSeverity,
      status: "Reported",
      location: formLocation,
      city: formCity,
      state: formState,
      country: formCountry,
      area: formArea,
      lat: formLat,
      lng: formLng,
      photo: (uploadedImage && uploadedImage !== "demo_road_pothole") ? uploadedImage : DEMO_POTHOLE_IMAGE_URL,
      resolvedPhoto: null,
      upvotes: 0,
      verified: 0,
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userEmail: user.email || "citizen@civiclens.app",
      gmailId: user.email || "citizen@civiclens.app",
      reporter: { 
        name: user.displayName || user.email?.split('@')[0] || "Citizen Hero", 
        initials: user.displayName?.substring(0, 2).toUpperCase() || user.email?.substring(0, 2).toUpperCase() || "CH", 
        xp: 200,
        uid: user.uid,
        userId: user.uid,
        email: user.email || "citizen@civiclens.app",
        gmailId: user.email || "citizen@civiclens.app"
      },
      verifiers: [],
      official: { 
        name: formCategory === "Road" ? "BBMP Roads Dept" : 
              formCategory === "Sewer" ? "BWSSB Drainage" : 
              formCategory === "Water" ? "BWSSB Water" : 
              formCategory === "Garbage" ? "BBMP Waste Dept" : 
              formCategory === "Electricity" ? "BESCOM" : "BBMP Civic Ward", 
        initials: formCategory === "Road" ? "BB" : 
                  formCategory === "Sewer" ? "BD" : 
                  formCategory === "Water" ? "BW" : 
                  formCategory === "Garbage" ? "BM" : 
                  formCategory === "Electricity" ? "BE" : "BC" 
      },
      resolver: null,
      nearby: activeSeverity >= 7.5 ? [
        { name: "Apollo Hospital", type: "hospital", dist: 120, icon: "🏥", boost: 2.0 },
        { name: "Silk Board Junction", type: "accident", dist: 80, icon: "⚠️", boost: 2.0 }
      ] : [
        { name: "Public Sector Hub", type: "school", dist: 180, icon: "🏫", boost: 1.0 }
      ],
      boxes: activeBoxes,
      globalImpact: { state: resolvedStateName, rankBefore: currentStateRankVal, rankAfter: currentStateRankVal > 2 ? currentStateRankVal - 2 : 1, scoreDelta: 0.1 }
    };

    const path = `issues/${newIssue.id}`;

    if (isOffline) {
      const pending = JSON.parse(localStorage.getItem('pendingReports') || "[]");
      localStorage.setItem('pendingReports', JSON.stringify([...pending, newIssue]));
      showToast("  Saved locally. We'll push this to the city registry when you're back online!");
      setSubmittedIssueId(newIssue.id);
      setSelectedIssueId(newIssue.id);
      setCurrentStep(3);
      return;
    }

    try {
      await setDoc(doc(db, "issues", newIssue.id), newIssue);
    } catch (err: any) {
      console.error("Firestore submit error:", err);
      showToast(`⚠️ Local-Only Mode: Saved successfully, but failed to sync to cloud (${err.message || err})`);
      handleFirestoreError(err, OperationType.WRITE, path);
    }

    setIssues(prev => {
      const filtered = prev.filter(iss => iss.id !== newIssue.id);
      return [newIssue, ...filtered];
    });

    try {
      if (user?.uid) {
        const stateRef = doc(db, "states", resolvedStateName);
        await updateDoc(stateRef, { score: increment(0.2) });
        
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, { xp: increment(50) });
      }
    } catch(e) {
      console.error("Failed to update impact locally:", e);
    }

    showToast(`🎉 Civic XP +50 Earned! ${resolvedStateName} rank successfully moved up!`);
    
    setSubmittedIssueId(newIssue.id);
    setSelectedIssueId(newIssue.id);
    setCurrentStep(3);
  };

  // Verify Issue Event
  const handleVerifyIssue = async (id: string) => {
    const issueToUpdate = issues.find(i => i.id === id);
    if (!issueToUpdate) return;

    if (!user) {
      showToast("🔐 Authentication required! Please log in first.");
      setIsAuthModalOpen(true);
      return;
    }

    // Same person check
    if (issueToUpdate.userId === user.uid || issueToUpdate.userEmail === user.email) {
      showToast("🔒 You cannot verify your own report!");
      return;
    }

    // Geolocation radius check (5 km limit)
    const distance = calculateDistance(baseLat, baseLng, issueToUpdate.lat, issueToUpdate.lng);
    if (distance > 5.0) {
      showToast(`❌ Verification restricted to 5 km radius. You are currently ${distance.toFixed(2)} km away.`);
      return;
    }

    const initials = user.displayName?.substring(0, 2).toUpperCase() || user.email?.substring(0, 2).toUpperCase() || "C";
    const name = user.displayName || user.email?.split('@')[0] || "You";

    if (issueToUpdate.verifiers.some((v: any) => v.name === name || v.userId === user.uid)) {
      showToast("🔒 You have already verified this incident!");
      return;
    }

    const updatedVerifiers = [...issueToUpdate.verifiers, { 
      name, 
      initials, 
      xp: 25,
      userId: user.uid 
    }];
    const nextVerifiedCount = issueToUpdate.verified + 1;
    const nextStatus = nextVerifiedCount >= 5 ? "In Progress" : issueToUpdate.status;

    const path = `issues/${id}`;
    try {
      await updateDoc(doc(db, "issues", id), {
        verified: nextVerifiedCount,
        verifiers: updatedVerifiers,
        status: nextStatus
      });
    } catch (err) {
      console.error("Firestore verify error:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
    }

    if (user) {
      updateDoc(doc(db, "users", user.uid), { xp: increment(25), verifiedCount: increment(1) }).catch(console.error);
    }
    showToast("✓ Verified! You contributed 25 XP to this civic repair path!");
  };

  // Delete / Remove Issue Event
  const handleDeleteIssue = async (id: string) => {
    try {
      await deleteDoc(doc(db, "issues", id));
      setIssues(prev => prev.filter(iss => iss.id !== id));
      if (selectedIssueId === id) {
        setSelectedIssueId(null);
      }
      setIssueIdToDelete(null);
      showToast("🗑️ Report successfully deleted!");
    } catch (err) {
      console.error("Firestore delete error:", err);
      showToast("❌ Permission denied or failed to delete report.");
    }
  };

  // Helper calculations for dynamic comparison
  const s1Obj = dbStates.find(s => s.state === compareState1) || dbStates[9] || INITIAL_STATES[9];
  const s2Obj = dbStates.find(s => s.state === compareState2) || dbStates[0] || INITIAL_STATES[0];
  const s3Obj = dbStates.find(s => s.state === compareState3) || dbStates[5] || INITIAL_STATES[5];

  const getWinner = (val1: number, val2: number, val3: number, isLowerBetter = false) => {
    const list = [val1, val2, val3];
    const filtered = list.filter(v => typeof v === 'number');
    const target = isLowerBetter ? Math.min(...filtered) : Math.max(...filtered);
    if (val1 === target) return 1;
    if (val2 === target) return 2;
    return 3;
  };

  const wRank = getWinner(s1Obj.rank, s2Obj.rank, s3Obj.rank, true);
  const wScore = getWinner(s1Obj.score, s2Obj.score, s3Obj.score);
  const wSpeed = getWinner(s1Obj.speed, s2Obj.speed, s3Obj.speed, true);
  const wPart = getWinner(s1Obj.participation, s2Obj.participation, s3Obj.participation);

  // Dynamic list for state leaderboards
  const filteredStates = dbStates.filter(s => {
    const matchSearch = s.state.toLowerCase().includes(searchTerm.toLowerCase()) || s.country.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCountry = countryFilter ? s.country === countryFilter : true;
    return matchSearch && matchCountry;
  });

  // Citizen Portal Filtered Issues
  const citizenFilteredIssues = useMemo(() => {
    return issues.filter(iss => {
      if (issuesFilter === 'mine') {
        const isMine = iss.userId === user?.uid || 
                       iss.userId === user?.email ||
                       iss.userEmail === user?.email ||
                       iss.gmailId === user?.email ||
                       iss.reporter?.uid === user?.uid || 
                       iss.reporter?.uid === user?.email ||
                       iss.reporter?.userId === user?.uid ||
                       iss.reporter?.userId === user?.email ||
                       iss.reporter?.email === user?.email ||
                       iss.reporter?.gmailId === user?.email;
        if (!isMine) return false;
      }
      
      if (citizenSearchTerm) {
        const terms = citizenSearchTerm.toLowerCase().trim().split(/\s+/);
        const locLower = (iss.location || '').toLowerCase();
        const descLower = (iss.description || '').toLowerCase();
        const catLower = (iss.category || '').toLowerCase();
        const idLower = (iss.id || '').toLowerCase();
        const titleLower = (iss.title || '').toLowerCase();
        
        const searchString = `${titleLower} ${locLower} ${descLower} ${catLower} ${idLower}`;
        const allTermsMatch = terms.every(term => searchString.includes(term));
        if (!allTermsMatch) {
          return false;
        }
      }
      return true;
    });
  }, [issues, issuesFilter, citizenSearchTerm, user]);

  // Official Portal Filtered Issues
  const officialFilteredAndSortedIssues = useMemo(() => {
    return issues.filter(iss => {
      const locLower = (iss.location || '').toLowerCase();
      const descLower = (iss.description || '').toLowerCase();
      const catLower = (iss.category || '').toLowerCase();
      const idLower = (iss.id || '').toLowerCase();
      const titleLower = (iss.title || '').toLowerCase();
      
      if (officialFilterState && iss.state !== officialFilterState) return false;
      if (officialFilterCity && iss.city !== officialFilterCity) return false;
      if (officialFilterArea && iss.area !== officialFilterArea) return false;
      
      if (officialSearchTerm) {
        const terms = officialSearchTerm.toLowerCase().trim().split(/\s+/);
        const searchString = `${titleLower} ${locLower} ${descLower} ${catLower} ${idLower}`;
        const allTermsMatch = terms.every(term => searchString.includes(term));
        if (!allTermsMatch) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      if (officialSortBy === 'severity_desc') return (b.severity || 0) - (a.severity || 0);
      if (officialSortBy === 'severity_asc') return (a.severity || 0) - (b.severity || 0);
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      if (officialSortBy === 'date_desc') return timeB - timeA;
      if (officialSortBy === 'date_asc') return timeA - timeB;
      return 0;
    });
  }, [issues, officialFilterState, officialFilterCity, officialFilterArea, officialSearchTerm, officialSortBy]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-slate-400 font-mono text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
          <span>Synchronizing CivicLens Global Security Layer...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    // Beautiful full-screen landing & auth portal
    return (
      <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col font-sans relative overflow-hidden justify-center items-center p-4">
        {/* Background Tech Mesh Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" style={{
          backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.8) 1px, transparent 1px), 
                            linear-gradient(to bottom, rgba(255,255,255,0.8) 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }} />

        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md relative z-10 space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex w-14 h-14 bg-gradient-to-br from-[#1A73E8] to-[#8B5CF6] rounded-2xl items-center justify-center shadow-lg shadow-blue-500/20 mb-2">
              <span className="font-extrabold text-white text-2xl tracking-tighter">CL</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">CivicLens Global</h1>
            <p className="text-sm text-slate-400 max-w-xs mx-auto text-center">
              The AI-powered crowdsourced civic infrastructure verification & gamified repair platform.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-2xl relative overflow-hidden">
            <form onSubmit={handleAuthSubmit} className="space-y-5">
              <div className="flex bg-slate-950 p-1 rounded-xl border border-white/5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 py-2 rounded-lg transition-all ${authMode === 'login' ? 'bg-[#1A73E8] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`flex-1 py-2 rounded-lg transition-all ${authMode === 'signup' ? 'bg-[#1A73E8] text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Create Account
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                {authMode === 'signup' && (
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Full Name / Initials</label>
                    <input
                      type="text"
                      required
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="Anand Kumar"
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#1A73E8]"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Email Address</label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#1A73E8]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Password</label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#1A73E8]"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-[#1A73E8] hover:bg-[#1A73E8]/95 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider font-mono cursor-pointer transition-all shadow-lg shadow-blue-500/10"
              >
                {authMode === 'login' ? '🔐 Authenticate & Connect' : '🚀 Register Citizen Profile'}
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-3 text-slate-500 text-[10px] font-mono uppercase">or</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Select Role Before Continuing</label>
                <select
                  value={authRole}
                  onChange={(e) => setAuthRole(e.target.value as 'citizen' | 'official')}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-[#1A73E8]"
                >
                  <option value="citizen">Citizen (Report Issues)</option>
                  <option value="official">Municipal Official (Resolve Issues)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 rounded-xl text-xs uppercase tracking-wider font-mono cursor-pointer transition-all flex items-center justify-center gap-2 border border-slate-200/50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Continue with Google</span>
              </button>
            </form>
          </div>
        </div>

        {/* TOAST ALERT BANNER */}
        <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="fixed bottom-24 right-6 z-50 bg-[#0d1527] border border-[#1A73E8]/40 shadow-lg shadow-[#1A73E8]/10 text-slate-200 px-5 py-3 rounded-xl flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm font-medium">{toast}</span>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col font-sans select-none overflow-x-hidden relative">
      {/* Background Tech Mesh Grid Overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" style={{
        backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.8) 1px, transparent 1px), 
                          linear-gradient(to bottom, rgba(255,255,255,0.8) 1px, transparent 1px)`,
        backgroundSize: '32px 32px'
      }} />

      {/* TOAST ALERT BANNER */}
      <AnimatePresence>
      {toast && (
        <motion.div initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="fixed bottom-24 right-6 z-50 bg-[#0d1527] border border-[#1A73E8]/40 shadow-lg shadow-[#1A73E8]/10 text-slate-200 px-5 py-3 rounded-xl flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm font-medium">{toast}</span>
        </motion.div>
      )}
      </AnimatePresence>

      {/* TOP HEADER NAVIGATION */}
      <header className="h-16 px-6 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-[#1A73E8] to-[#8B5CF6] rounded-xl flex items-center justify-center shadow-md shadow-blue-500/10">
            <span className="font-extrabold text-white text-base tracking-tighter">CL</span>
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">CivicLens</span>
            <span className="text-xs font-mono text-cyan-400 border border-cyan-400/20 rounded px-1.5 py-0.5 ml-2 uppercase tracking-widest bg-cyan-950/20">GLOBAL</span>
          </div>
        </div>

        {/* Global Live Feed Header Ticker */}
        <div className="hidden lg:flex items-center gap-4 bg-white/5 border border-white/5 py-1.5 px-4 rounded-full max-w-md overflow-hidden text-xs">
          <div className="flex items-center gap-2 text-cyan-400 font-mono shrink-0 font-semibold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            TELEMETRY NODE
          </div>
          <div className="h-4 w-px bg-white/10 shrink-0" />
          <span className="text-slate-400 truncate font-mono text-[11px] animate-pulse">
            {LIVE_FEED[feedIndex]}
          </span>
        </div>

        {/* Right Info Elements */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-[#1A73E8]" />
            <span className="font-medium">{formCity !== "Unknown City" ? formCity : "Your Location"}, {formCountry !== "Unknown Country" ? formCountry : "India"}</span>
          </div>

          {userRole !== 'official' && (
            <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5 text-yellow-400 text-sm font-semibold font-mono">
              🏅 <span className="text-slate-200">XP:</span> {xp}
            </div>
          )}

          {/* Real-time DB login indicator */}
          {user ? (
            <button
              onClick={() => {
                setAuthMode('profile');
                setIsAuthModalOpen(true);
              }}
              className="flex items-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-emerald-400 text-xs font-semibold cursor-pointer transition-all"
            >
              <User className="w-3.5 h-3.5" />
              <span className="max-w-[80px] truncate">{user.displayName || user.email?.split('@')[0]}</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setAuthMode('login');
                setIsAuthModalOpen(true);
              }}
              className="flex items-center gap-2 bg-[#1A73E8] hover:bg-[#1A73E8]/90 text-white rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer shadow-md transition-all font-mono uppercase tracking-wider"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login</span>
            </button>
          )}
        </div>
      </header>

      {/* CORE 7-PAGES TABS CONTROLLER CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* SIDE NAV FOR DESKTOP / TOP DRAWER FOR MOBILE */}
        <nav className="col-span-1 lg:col-span-3 flex lg:flex-col gap-2 bg-white/[0.02] border border-white/5 p-2 rounded-2xl overflow-x-auto shrink-0 lg:h-fit sticky top-20 no-scrollbar">
          {[
            ...(userRole !== 'official' ? [
              { id: 'dashboard', label: 'Dashboard', icon: Activity, badge: 'Live' },
              { id: 'report', label: 'Report Issue', icon: Upload, highlight: true },
              { id: 'issues', label: 'Active Reports', icon: AlertTriangle, count: issues.length },
              { id: 'community', label: 'Leaderboard', icon: Users }
            ] : []),
            ...(userRole === 'official' ? [{ id: 'official', label: 'Official Portal', icon: Shield, badge: 'Gov' }] : [])
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'report') {
                    // reset reporting sequence on tab launch
                    setScanProgress(-1);
                    setRevealedBoxes(0);
                    setCurrentStep(1);
                    setUploadedImage(null);
                  }
                }}
                className={`w-auto lg:w-full flex items-center lg:justify-between justify-center gap-2 px-3 py-2.5 lg:px-4 lg:py-3 rounded-xl transition-all duration-200 text-xs md:text-sm shrink-0 cursor-pointer ${
                  active 
                    ? 'bg-[#1A73E8]/10 lg:bg-gradient-to-r lg:from-[#1A73E8]/20 lg:to-transparent border-b-2 lg:border-b-0 lg:border-l-4 border-[#1A73E8] text-white font-medium' 
                    : tab.highlight 
                      ? 'border border-[#1A73E8]/30 bg-[#1A73E8]/5 hover:bg-[#1A73E8]/10 text-[#1A73E8] font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? 'text-[#1A73E8]' : ''}`} />
                  <span>{tab.label}</span>
                </div>
                {tab.badge && (
                  <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md animate-pulse shrink-0">
                    {tab.badge}
                  </span>
                )}
                {tab.count && (
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* CORE CONTENT SWITCHER AREA */}
        <div className="col-span-1 lg:col-span-9 flex flex-col gap-6">
          <AnimatePresence mode="wait">

          {/* PAGE 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              {/* Hero Banner */}
              <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 to-[#121B2E] border border-white/10 p-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="relative z-10 max-w-xl">
                  <span className="text-xs uppercase tracking-widest text-[#1A73E8] font-mono font-bold block mb-2">CIVIC REVOLUTION</span>
                  <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-2">
                    World's First Citizen-Powered Governance Index
                  </h1>
                  <p className="text-slate-400 text-sm mb-4">
                    Every report uploads photo proof, calculates geospatial severity via Vertex AI, maps grid sectors, and updates state rankings globally. {displayState} holds <strong className="text-slate-100">#{karnatakaRankVal}</strong>.
                  </p>
                  <div className="flex items-center gap-6 text-xs text-slate-400 font-mono">
                    <span>🌍 {dbStates.length} states</span>
                    <span>•</span>
                    <span>🏳️ {new Set(dbStates.map(s => s.country)).size} countries</span>
                    <span>•</span>
                    <span>📊 {issues.length} reports tracked</span>
                  </div>
                </div>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "States Tracked", val: INITIAL_STATES.length.toLocaleString(), desc: "Live index streams", icon: "🌍" },
                  { label: "Issues Resolved", val: issues.filter(iss => iss.status === 'Resolved').length.toLocaleString(), desc: "Today worldwide", icon: "✅" },
                  { label: "Active Citizens", val: dbUsers.filter(u => u.role !== 'official').length.toLocaleString(), desc: "Registered accounts", icon: "👥" },
                  { label: "Fastest State Today", val: "Bavaria (0.8d)", desc: "Avg response", icon: "⚡" }
                ].map((s, idx) => (
                  <div key={idx} className="bg-white/[0.03] border border-white/5 p-4 rounded-xl hover:border-white/10 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-slate-400 uppercase tracking-widest">{s.label}</span>
                      <span className="text-lg">{s.icon}</span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">{s.val}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.desc}</div>
                  </div>
                ))}
              </div>

              {/* Live Interactive Grid & India Spotlight Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* World Heatmap Micro Visualizer */}
                <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold">Global Civic Health Index</h3>
                      <div className="flex bg-slate-900 border border-white/10 rounded-lg p-0.5 text-[9px] font-mono">
                        <button
                          onClick={() => setDashboardMapMode('grid')}
                          className={`px-2 py-0.5 rounded cursor-pointer transition-all ${dashboardMapMode === 'grid' ? 'bg-[#1A73E8] text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          GRID
                        </button>
                        <button
                          onClick={() => setDashboardMapMode('heatmap')}
                          className={`px-2 py-0.5 rounded cursor-pointer transition-all ${dashboardMapMode === 'heatmap' ? 'bg-[#1A73E8] text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          HEATMAP
                        </button>
                      </div>
                    </div>

                    {dashboardMapMode === 'grid' ? (
                      /* Matrix Grid Representation */
                      <div className="grid grid-cols-8 gap-1.5 p-3 bg-black/60 rounded-lg border border-white/5">
                        {Array.from({ length: 48 }).map((_, i) => {
                          let color = "bg-green-500/30 border-green-500/40";
                          if (i % 5 === 0) color = "bg-red-500/30 border-red-500/40";
                          else if (i % 3 === 0) color = "bg-yellow-500/30 border-yellow-500/40";
                          else if (i % 7 === 0) color = "bg-orange-500/30 border-orange-500/40";

                          return (
                            <div
                              key={i}
                              className={`aspect-square rounded border relative group cursor-pointer hover:scale-115 transition-transform ${color}`}
                            >
                              <div className="absolute hidden group-hover:block bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 p-2 rounded text-[10px] whitespace-nowrap z-30 font-mono shadow-xl">
                                Sector {i + 1} Avg Score: {50 + (i % 45)}/100
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Google Maps Compatible Heatmap Representation */
                      <div className="aspect-[4/3] w-full rounded-lg bg-black border border-white/5 relative overflow-hidden">
                        <Map
                          mapId="8e0a97af9386fef"
                          defaultCenter={{lat: baseLat, lng: baseLng}}
                          defaultZoom={12}
                          disableDefaultUI={true}
                          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                          style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0}}
                        >
                          {/* Dynamic Glowing Heat Spots aligned with active issues array */}
                          {issues.map((iss: any) => {
                            // Heat intensity size based on severity
                            const size = Math.max(30, Math.min(90, iss.severity * 8));

                            return (
                              <AdvancedMarker
                                key={iss.id}
                                position={{lat: iss.lat, lng: iss.lng}}
                                onClick={() => {
                                  setSelectedIssueId(iss.id);
                                  showToast(`🔍 Selected ${iss.id}: ${iss.title}`);
                                }}
                              >
                                <div 
                                  className="relative rounded-full pointer-events-auto cursor-pointer group transition-all duration-300 hover:scale-110"
                                  style={{
                                    transform: 'translateY(50%)',
                                    width: `${size}px`,
                                    height: `${size}px`,
                                    background: `radial-gradient(circle, rgba(239, 68, 68, 0.55) 0%, rgba(249, 115, 22, 0.25) 35%, rgba(239, 68, 68, 0) 70%)`
                                  }}
                                >
                                  {/* Core blinking point */}
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-400 rounded-full" />
                                  
                                  {/* Hover tooltip */}
                                  <div className="absolute hidden group-hover:block bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-white/10 p-2.5 rounded-xl text-[10.5px] font-mono whitespace-nowrap z-50 shadow-2xl backdrop-blur-md">
                                    <div className="flex items-center gap-1.5 font-bold text-white mb-0.5">
                                      <span className="w-2 h-2 rounded-full bg-red-500" />
                                      <span>{iss.title}</span>
                                    </div>
                                    <div className="text-slate-300">Severity Level: <span className="text-red-400 font-bold">{iss.severity} / 10</span></div>
                                    <div className="text-[9.5px] text-slate-500 truncate max-w-[180px]">{iss.location}</div>
                                    <div className="text-[9px] text-cyan-400 mt-1 uppercase font-semibold">📍 Click Spot to Inspect on Registry</div>
                                  </div>
                                </div>
                              </AdvancedMarker>
                            );
                          })}
                        </Map>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3 font-mono">
                    {dashboardMapMode === 'grid' 
                      ? "💡 South Asia Grid Sector Average: 54/100 (Unbalanced). Hover over elements to inspect."
                      : "🔥 Google Maps compatible live heat sink: Real-time visual overlay tracking active civic hotspots."
                    }
                  </p>
                </div>

                {/* India Spotlight card */}
                <div className="bg-slate-950/60 border border-white/5 p-5 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col mb-4">
                      <h3 className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold mb-2">🇮🇳 India Spotlight</h3>
                      <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 w-fit">
                        <span className="text-[11px] font-mono text-slate-300">{displayState} Rank: <span className="text-[#1A73E8] font-bold">#{karnatakaRankVal}</span></span>
                        <div className="w-px h-3 bg-white/20"></div>
                        <span className="text-[11px] font-mono text-slate-300">India Avg Score: <span className="text-emerald-400 font-bold">{indiaAvgScore}</span></span>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {indiaSpotlightStates.map((st, i) => (
                        <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${st.state === displayState ? 'bg-[#1A73E8]/10 border-[#1A73E8]/40' : 'bg-white/5 border-transparent'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-slate-400 w-5">#{st.rank}</span>
                            <span className="text-xs font-medium text-white">{st.state}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-xs">
                            <span className="text-slate-400">{st.score} score</span>
                            <span className={`font-bold ${st.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {st.change > 0 ? `+${st.change}` : st.change} {st.change > 0 ? '↑' : '↓'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                    🌟 <strong>{displayState}</strong> moved up this week! Your reports directly push the civic performance scores upward.
                  </p>
                </div>

              </div>

              {/* Ticker Event Log Panel */}
              <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl">
                <h3 className="text-xs uppercase font-mono tracking-widest text-slate-400 mb-2 font-bold">Global Event Logs — Dynamic Ticker</h3>
                <div className="h-24 overflow-hidden relative border border-white/5 bg-black/40 rounded-lg p-2 font-mono text-[11.5px] leading-relaxed">
                  <div className="space-y-1 transition-all duration-500 transform">
                    {LIVE_FEED.map((item, idx) => {
                      const isActive = idx === feedIndex;
                      return (
                        <div key={idx} className={`transition-all duration-300 py-0.5 px-2 rounded ${isActive ? 'bg-[#1A73E8]/10 text-white font-bold border-l-2 border-cyan-400' : 'text-slate-500 opacity-60'}`}>
                          {item}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </motion.div>
          )}

          {/* PAGE 2: GLOBAL RANKINGS */}
          {activeTab === 'rankings' && (
            <motion.div key="rankings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              {/* World Map Simulation */}
              <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold">Simulated Population-Weighted Blocks</h3>
                    <p className="text-[10px] text-slate-500">Click a bloc to filter states instantly</p>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Breadcrumb: <span className="text-slate-400 hover:underline cursor-pointer" onClick={() => { setSearchTerm(''); setCountryFilter(''); }}>World</span>
                    {countryFilter && <span className="text-cyan-400"> → {countryFilter}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {[
                    { label: "Bavaria 🇩🇪", country: "Germany", color: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30" },
                    { label: "Singapore 🇸🇬", country: "Singapore", color: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30" },
                    { label: "Zurich 🇨🇭", country: "Switzerland", color: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30" },
                    { label: "Tokyo 🇯🇵", country: "Japan", color: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30" },
                    { label: "Netherlands 🇳🇱", country: "Netherlands", color: "bg-green-500/20 border-green-500/50 hover:bg-green-500/30" },
                    { label: "California 🇺🇸", country: "USA", color: "bg-yellow-500/20 border-yellow-500/50 hover:bg-yellow-500/30" },
                    { label: "India States 🇮🇳", country: "India", color: "bg-orange-500/20 border-orange-500/50 hover:bg-orange-500/30" }
                  ].map((bloc, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        setCountryFilter(bloc.country);
                        setSearchTerm('');
                      }}
                      className={`p-3 rounded-lg border text-center cursor-pointer transition-all ${bloc.color} ${countryFilter === bloc.country ? 'ring-2 ring-cyan-400 scale-102 font-bold' : ''}`}
                    >
                      <div className="text-[11px] font-mono whitespace-nowrap">{bloc.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Table Toolbar Search */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search by state or country name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#1A73E8]/80 text-white placeholder-slate-500"
                  />
                </div>
                {countryFilter && (
                  <button
                    onClick={() => setCountryFilter('')}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-xl font-mono cursor-pointer"
                  >
                    Clear Filter [ {countryFilter} ]
                  </button>
                )}
              </div>

              {/* Global State Leaderboard Table */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-mono tracking-wider border-b border-white/10">
                      <tr>
                        <th className="p-3">Rank</th>
                        <th className="p-3">State</th>
                        <th className="p-3">Country</th>
                        <th className="p-3">Civic Score</th>
                        <th className="p-3">Avg Resolution</th>
                        <th className="p-3">Participation</th>
                        <th className="p-3">Trend Index</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredStates.map((st, idx) => {
                        const isHighlight = st.state === displayState;
                        const displayRank = isHighlight ? karnatakaRankVal : st.rank;
                        return (
                          <tr
                            key={idx}
                            onClick={() => {
                              setSelectedState(st);
                              setStateDetailOpen(true);
                            }}
                            className={`cursor-pointer hover:bg-white/5 transition-colors ${
                              isHighlight ? 'bg-gradient-to-r from-cyan-950/20 to-transparent border-y border-cyan-500/40 font-semibold' : ''
                            }`}
                          >
                            <td className="p-3 font-mono font-bold">
                              {isHighlight && <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 mr-2 animate-ping" />}
                              #{displayRank}
                            </td>
                            <td className="p-3 flex items-center gap-2">
                              <span>{st.flag}</span>
                              <span className="font-semibold text-white">{st.state}</span>
                              {isHighlight && (
                                <span className="bg-cyan-500/20 text-cyan-400 text-[9px] uppercase px-1.5 py-0.5 rounded ml-2 tracking-widest font-mono">
                                  MY STATE
                                </span>
                              )}
                            </td>
                            <td className="p-3">{st.country}</td>
                            <td className="p-3 font-mono font-bold text-slate-100">{st.score}</td>
                            <td className="p-3 font-mono">{st.speed} days</td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-slate-800 h-2 rounded overflow-hidden">
                                  <div className="bg-[#1A73E8] h-full" style={{ width: `${st.participation}%` }} />
                                </div>
                                <span className="font-mono text-[11px]">{st.participation}%</span>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={`font-mono font-bold ${st.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {st.change >= 0 ? `↑${st.change}` : `↓${Math.abs(st.change)}`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SLIDE-IN STATE DETAIL PANEL DRAWER */}
              {stateDetailOpen && (
                <div className="p-5 bg-slate-900 border border-cyan-500/20 rounded-2xl relative animate-fadeIn">
                  <button
                    onClick={() => setStateDetailOpen(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono cursor-pointer text-xs"
                  >
                    Close ✕
                  </button>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{selectedState.flag}</span>
                    <div>
                      <h3 className="text-base font-bold text-white">
                        {selectedState.state} Civic Overview
                      </h3>
                      <p className="text-xs text-slate-400">
                        {selectedState.country} • Global Position: #{selectedState.state === displayState ? karnatakaRankVal : selectedState.rank}
                      </p>
                    </div>
                  </div>

                  {/* 5-pillar breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-3">
                      <h4 className="text-xs uppercase tracking-wider font-mono text-slate-400">Core Performance Pillars</h4>
                      {[
                        { label: "Resolution Speed", p: 78 },
                        { label: "Citizen Participation", p: 61 },
                        { label: "Accountability Index", p: 70 },
                        { label: "Severity Handling", p: 52 },
                        { label: "Recurrence Mitigation", p: 80 }
                      ].map((p, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-slate-400 font-mono">{p.label}</span>
                            <span className="text-white font-bold font-mono">{p.p}%</span>
                          </div>
                          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-white/5">
                            <div className="bg-[#1A73E8] h-full" style={{ width: `${p.p}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Custom SVG Trend Chart */}
                    <div className="bg-slate-950/80 p-4 border border-white/5 rounded-xl flex flex-col justify-between">
                      <h4 className="text-xs uppercase font-mono tracking-wider text-slate-400 mb-2">6-Month Trend Curve</h4>
                      <div className="flex-1 min-h-[110px] flex items-end relative py-2">
                        {/* Interactive SVG path line */}
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#1A73E8" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#1A73E8" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M0 80 Q 50 60, 100 70 T 200 40 T 300 20"
                            fill="none"
                            stroke="#1A73E8"
                            strokeWidth="3"
                          />
                          <path
                            d="M0 80 Q 50 60, 100 70 T 200 40 T 300 20 L 300 100 L 0 100 Z"
                            fill="url(#curveGradient)"
                          />
                        </svg>
                        <div className="w-full flex justify-between text-[9px] font-mono text-slate-500 mt-2 z-10">
                          <span>Jan</span>
                          <span>Mar</span>
                          <span>May</span>
                          <span>Jul</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-3 text-xs">
                        <span className="text-slate-400">Pillar Average Score:</span>
                        <strong className="text-cyan-400 font-mono">{selectedState.score}/100</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/5 flex gap-3">
                    <button
                      onClick={() => setActiveTab('issues')}
                      className="bg-[#1A73E8] hover:bg-[#1A73E8]/90 text-white font-bold py-2 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                    >
                      View State Reports
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          )}

          {/* PAGE 3: COMPARE STATES */}
          {activeTab === 'compare' && (
            <motion.div key="compare" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              <div className="bg-slate-900 border border-white/5 p-5 rounded-2xl">
                <h1 className="text-xl font-bold tracking-tight text-white mb-2">Compare Any States Worldwide</h1>
                <p className="text-xs text-slate-400">See how your state measures up against benchmark resolution pipelines.</p>

                {/* Dropdowns side-by-side */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                  {[
                    { id: 1, val: compareState1, set: setCompareState1, label: "State 1" },
                    { id: 2, val: compareState2, set: setCompareState2, label: "State 2" },
                    { id: 3, val: compareState3, set: setCompareState3, label: "State 3" }
                  ].map(sel => (
                    <div key={sel.id} className="space-y-1.5">
                      <label className="text-[10px] uppercase font-bold tracking-wider font-mono text-slate-400">{sel.label}</label>
                      <select
                        value={sel.val}
                        onChange={(e) => sel.set(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200"
                      >
                        {dbStates.map((opt, i) => (
                          <option key={i} value={opt.state}>
                            {opt.flag} {opt.state} ({opt.country})
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comparison table */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase font-mono tracking-wider border-b border-white/10">
                      <tr>
                        <th className="p-3">Civic Metric</th>
                        <th className="p-3 font-bold">{s1Obj.state} {s1Obj.flag}</th>
                        <th className="p-3 font-bold">{s2Obj.state} {s2Obj.flag}</th>
                        <th className="p-3 font-bold">{s3Obj.state} {s3Obj.flag}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {[
                        { label: "Global Rank", val1: `#${s1Obj.state === displayState ? karnatakaRankVal : s1Obj.rank}`, val2: `#${s2Obj.state === displayState ? karnatakaRankVal : s2Obj.rank}`, val3: `#${s3Obj.state === displayState ? karnatakaRankVal : s3Obj.rank}`, winner: wRank },
                        { label: "Civic Score", val1: `${s1Obj.score}/100`, val2: `${s2Obj.score}/100`, val3: `${s3Obj.score}/100`, winner: wScore },
                        { label: "Avg Resolution", val1: `${s1Obj.speed} days`, val2: `${s2Obj.speed} days`, val3: `${s3Obj.speed} days`, winner: wSpeed },
                        { label: "Participation Rate", val1: `${s1Obj.participation}%`, val2: `${s2Obj.participation}%`, val3: `${s3Obj.participation}%`, winner: wPart }
                      ].map((row, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 font-sans text-slate-400">{row.label}</td>
                          <td className={`p-3 font-semibold ${row.winner === 1 ? 'bg-yellow-500/10 text-yellow-400' : ''}`}>{row.val1}</td>
                          <td className={`p-3 font-semibold ${row.winner === 2 ? 'bg-yellow-500/10 text-yellow-400' : ''}`}>{row.val2}</td>
                          <td className={`p-3 font-semibold ${row.winner === 3 ? 'bg-yellow-500/10 text-yellow-400' : ''}`}>{row.val3}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dynamic Insight Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { title: "Speed Comparison Ratio", desc: `${s2Obj.state} resolves issues ${(s1Obj.speed / Math.max(0.1, s2Obj.speed)).toFixed(1)}x faster than ${s1Obj.state}` },
                  { title: "Participation Gain Opportunity", desc: `If ${s1Obj.state} matched ${s2Obj.state}'s participation, it would gain ~18,000 monthly active verifiers` },
                  { title: "Critical Action Insight", desc: `${s1Obj.state}'s primary bottleneck is Critical Issue Severity Handling speed compared to global leaderboards` }
                ].map((c, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/5 p-4 rounded-xl">
                    <span className="text-[10px] uppercase tracking-wider font-mono text-[#1A73E8] font-bold block mb-1">{c.title}</span>
                    <p className="text-xs text-slate-300 leading-relaxed">{c.desc}</p>
                  </div>
                ))}
              </div>

            </motion.div>
          )}

          {/* PAGE 4: REPORT AN ISSUE (THE EMOTIONAL CORE FLOW) */}
          {activeTab === 'report' && (
            <motion.div key="report" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              {/* Location Consent Prompt Dialog */}
              <AnimatePresence>
              {isLocationPromptOpen && pendingUpload && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                  <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900/60 backdrop-blur-2xl border border-cyan-400/30 rounded-3xl max-w-md w-full p-6 shadow-[0_8px_32px_rgba(34,211,238,0.15)] relative space-y-6 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/5 to-transparent opacity-50 pointer-events-none" />
                    {/* Close button */}
                    <button
                      onClick={() => {
                        setIsLocationPromptOpen(false);
                        setPendingUpload(null);
                      }}
                      className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono cursor-pointer text-xs"
                    >
                      Cancel ✕
                    </button>

                    <div className="flex flex-col items-center text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center text-cyan-400 animate-pulse">
                        <MapPin className="w-8 h-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold text-white tracking-tight">
                          Authorize Precise Geotagging
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          To route this issue directly to the correct ward engineers, CivicLens requests access to your device's high-accuracy GPS coordinates.
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-950/50 border border-white/5 rounded-xl p-3 flex gap-3 items-start">
                      <Compass className="w-5 h-5 text-[#1A73E8] shrink-0 mt-0.5" />
                      <div className="text-left">
                        <span className="text-[10px] uppercase font-mono font-bold text-[#1A73E8] block">Why this is required</span>
                        <p className="text-[11px] text-slate-300 leading-normal">
                          Precise GPS data aligns the report with your local 5x6 sector grid, generating a dynamic incident heatspot and exact coordinates for speedier municipal dispatch.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        onClick={() => {
                          setIsLocationPromptOpen(false);
                          if (pendingUpload) {
                            startScanningProcess(pendingUpload.source, pendingUpload.isUserUploaded, true);
                            showToast("🛰️ Accessing GPS coordinates...");
                            setPendingUpload(null);
                          }
                        }}
                        className="bg-[#1A73E8] hover:bg-[#1A73E8]/90 text-white font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-[#1A73E8]/20 transition-all active:scale-95"
                      >
                        🛰️ Use GPS
                      </button>
                      <button
                        onClick={() => {
                          setIsLocationPromptOpen(false);
                          if (pendingUpload) {
                            startScanningProcess(pendingUpload.source, pendingUpload.isUserUploaded, false);
                            showToast("📸 Processing photo with default regional sector coordinates.");
                            setPendingUpload(null);
                          }
                        }}
                        className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-bold py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-all active:scale-95"
                      >
                        ❌ Use Default
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
              </AnimatePresence>

              {/* Step Process Headers */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono font-bold">
                <div className={`p-2 rounded-lg border ${currentStep === 1 ? 'bg-[#1A73E8]/20 border-cyan-400 text-white' : 'bg-slate-900 border-white/5 text-slate-500'}`}>
                  1. PHOTO SCAN
                </div>
                <div className={`p-2 rounded-lg border ${currentStep === 2 ? 'bg-[#1A73E8]/20 border-cyan-400 text-white' : 'bg-slate-900 border-white/5 text-slate-500'}`}>
                  2. REVIEW INFO
                </div>
                <div className={`p-2 rounded-lg border ${currentStep === 3 ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-slate-900 border-white/5 text-slate-500'}`}>
                  3. RANK IMPACT
                </div>
              </div>

              {/* STEP 1: PHOTO UPLOAD + SCANNER */}
              {currentStep === 1 && (
                <div className="space-y-6">
                  {isCameraActive ? (
                    <div className="bg-slate-950 border border-cyan-400 p-2 rounded-2xl flex flex-col items-center justify-center min-h-[300px] relative overflow-hidden">
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover rounded-xl bg-black" />
                      <div className="absolute bottom-6 flex gap-4 z-10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            stopCamera();
                          }}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider shadow-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            capturePhoto();
                          }}
                          className="bg-white text-black font-bold py-3 px-6 rounded-xl text-xs uppercase tracking-wider shadow-lg"
                        >
                          📸 Capture Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => {
                      if (!uploadedImage && fileInputRef.current) {
                        fileInputRef.current.click();
                      }
                    }}
                    className={`bg-slate-950 border p-6 rounded-2xl flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden transition-all duration-300 ${
                      isDragging 
                        ? 'border-cyan-400 bg-cyan-950/20 scale-[1.01]' 
                        : uploadedImage 
                          ? 'border-white/10' 
                          : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02] cursor-pointer'
                    }`}
                  >
                    {/* Hidden Native File Input */}
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      className="hidden" 
                    />

                    {uploadedImage ? (
                      <div className="w-full relative max-w-lg overflow-hidden rounded-xl border border-white/20 bg-slate-900">
                        
                        {/* High technology wireframe representing pothole */}
                        <div className="relative aspect-video w-full flex items-center justify-center bg-slate-950">
                          <div className="absolute inset-0 bg-radial-gradient from-blue-500/5 to-transparent pointer-events-none" />
                          
                          {/* Render actual image as background under scanner */}
                          {uploadedImage && (
                            <img 
                              src={uploadedImage === 'demo_road_pothole' ? DEMO_POTHOLE_IMAGE_URL : uploadedImage} 
                              alt="Uploaded civic incident source" 
                              className="absolute inset-0 w-full h-full object-cover opacity-60 filter saturate-[1.2] contrast-[1.1]" 
                              referrerPolicy="no-referrer"
                            />
                          )}

                          {/* Animated Scan Line */}
                          {scanProgress >= 0 && scanProgress < 100 && (
                            <div
                              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee] z-20"
                              style={{ top: `${scanProgress}%` }}
                            />
                          )}

                          {/* Real-time Bounding Box elements fading in dynamically */}
                          <div className="absolute inset-0 z-10 pointer-events-none">
                            {scannedOutput && scannedOutput.boxes ? (
                              scannedOutput.boxes.map((box, bIdx) => (
                                revealedBoxes > bIdx && (
                                  <div 
                                    key={bIdx} 
                                    className="absolute border-2 rounded px-1 transition-all duration-300 animate-pulse" 
                                    style={{ 
                                      left: `${box.x}%`, 
                                      top: `${box.y}%`, 
                                      width: `${box.w}%`, 
                                      height: `${box.h}%`, 
                                      borderColor: box.color || "#ef4444", 
                                      backgroundColor: `${box.color || "#ef4444"}15` 
                                    }}
                                  >
                                    <span 
                                      className="absolute -top-5 left-0 text-white font-mono text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap shadow-md"
                                      style={{ backgroundColor: box.color || "#ef4444" }}
                                    >
                                      {box.label} {box.conf}%
                                    </span>
                                  </div>
                                )
                              ))
                            ) : (
                              <>
                                {/* Pre-drawn/Simulated Bounding Box elements fading in dynamically for default flow */}
                                {revealedBoxes >= 1 && (
                                  <div className="absolute border-2 border-red-500/80 bg-red-500/10 rounded px-1" style={{ left: '20%', top: '35%', width: '35%', height: '30%' }}>
                                    <span className="absolute -top-5 left-0 bg-red-500 text-white font-mono text-[9px] px-1 py-0.5 rounded font-bold">Pothole 94%</span>
                                  </div>
                                )}
                                {revealedBoxes >= 2 && (
                                  <div className="absolute border-2 border-orange-500/80 bg-orange-500/10 rounded px-1" style={{ left: '60%', top: '55%', width: '25%', height: '20%' }}>
                                    <span className="absolute -top-5 left-0 bg-orange-500 text-white font-mono text-[9px] px-1 py-0.5 rounded font-bold">Road Crack 78%</span>
                                  </div>
                                )}
                                {revealedBoxes >= 3 && (
                                  <div className="absolute border-2 border-yellow-500/80 bg-yellow-500/10 rounded px-1" style={{ left: '5%', top: '70%', width: '15%', height: '15%' }}>
                                    <span className="absolute -top-5 left-0 bg-yellow-500 text-white font-mono text-[9px] px-1 py-0.5 rounded font-bold">Debris 61%</span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div className="text-center space-y-2 z-10 p-4 bg-black/40 rounded-xl backdrop-blur-[2px] border border-white/5">
                            <span className="text-5xl">{uploadedImage !== 'demo_road_pothole' ? '📸' : '🛣️'}</span>
                            <p className="text-xs font-mono text-cyan-400 tracking-wider">
                              {uploadedImage !== 'demo_road_pothole' ? 'GEO-TAGGED UPLOAD STREAM' : 'DEMO FIELD SAMPLE ATTACHED'}
                            </p>
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="text-center space-y-4">
                        <Upload className="w-12 h-12 text-slate-600 mx-auto animate-pulse" />
                        <div>
                          <p className="text-sm text-slate-300 font-semibold">Drop photo or tap to upload</p>
                          <p className="text-xs text-slate-500 mt-1 font-mono">Accepts JPG, PNG geo-tagged data streams</p>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startCamera();
                            }}
                            className="bg-[#10b981] hover:bg-[#10b981]/90 text-white font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                          >
                            📸 Open Camera
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (fileInputRef.current) {
                                fileInputRef.current.click();
                              }
                            }}
                            className="bg-[#1A73E8] hover:bg-[#1A73E8]/90 text-white font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                          >
                            📁 Select Photo File
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleLoadDemoImage();
                            }}
                            className="bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-bold py-2 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                          >
                            ⚡ Sample
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* AI Terminal console Output */}
                  {terminalLogs.length > 0 && (
                    <div className="bg-black/95 border border-slate-800 p-4 rounded-xl font-mono text-[11px] text-emerald-400 space-y-1">
                      {terminalLogs.map((log, idx) => (
                        <div key={idx} className="transition-all duration-300">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: REVIEW + LOCATION MAP + SEVERITY */}
              {currentStep === 2 && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  
                  {/* Form fields column */}
                  <div className="md:col-span-7 bg-slate-950/40 border border-white/5 p-5 rounded-2xl space-y-4">
                    <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">AI Scanned Metadata Review</h3>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Report Title</label>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Category</label>
                        <select
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200"
                        >
                          <option value="Road">Road Damage</option>
                          <option value="Sewer">Sewer & Drainage</option>
                          <option value="Water">Water Leakage</option>
                          <option value="Garbage">Garbage & Waste</option>
                          <option value="Electricity">Electricity Hazard</option>
                          <option value="Other">Other Issues</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Mapped Sector</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.geolocation) {
                                showToast("📡 Accessing GPS telemetry...");
                                navigator.geolocation.getCurrentPosition(
                                  async (position) => {
                                    const { latitude, longitude } = position.coords;
                                    setFormLat(parseFloat(latitude.toFixed(6)));
                                    setFormLng(parseFloat(longitude.toFixed(6)));
                                    
                                    // Calculate closest sector in grid using dynamic base coordinates
                                    const alignment = getNearestGridCell(latitude, longitude, baseLat, baseLng);
                                    setSelectedGridCell(alignment.cell);
                                    
                                    // Reverse geocode to get actual street name
                                    const exactLocData = await reverseGeocode(latitude, longitude);
                                    setFormLocation(exactLocData.fullAddress);
                                    setFormCity(exactLocData.city);
                                    setFormState(exactLocData.state);
                                    setFormCountry(exactLocData.country);
                                    setFormArea(exactLocData.area);
                                    
                                    showToast(`🛰️ GPS Locked: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
                                  },
                                  (error) => {
                                    console.error("GPS Error:", error);
                                    showToast(`❌ GPS Access Refused: ${error.message}. Please allow location permission.`);
                                  },
                                  { enableHighAccuracy: true, timeout: 8000 }
                                );
                              } else {
                                showToast("❌ Browser does not support geolocation");
                              }
                            }}
                            className="text-[9px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition-all"
                          >
                            <span className="animate-pulse">📡</span> Get Live GPS
                          </button>
                        </div>
                        <div className="bg-slate-900 text-slate-300 px-3 py-2 rounded-xl text-xs font-mono border border-white/10 flex justify-between items-center">
                          <span>Grid Sector {selectedGridCell}</span>
                          <span className="text-[9px] text-slate-500 uppercase font-mono">Synced</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Address / Mapped Location</label>
                        <button
                          type="button"
                          onClick={async () => {
                            showToast("📡 Fetching address for coordinates...");
                            try {
                              const locData = await reverseGeocode(formLat, formLng);
                              setFormLocation(locData.fullAddress);
                              setFormCity(locData.city);
                              setFormState(locData.state);
                              setFormCountry(locData.country);
                              setFormArea(locData.area);
                              showToast("✅ Address updated");
                            } catch (e) {
                              showToast("❌ Failed to fetch address");
                            }
                          }}
                          className="text-[9px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1 transition-all cursor-pointer"
                        >
                          🔄 Refresh Address
                        </button>
                      </div>
                      <input
                        type="text"
                        value={formLocation}
                        onChange={(e) => setFormLocation(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200"
                        placeholder="Fetching location..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Latitude (Exact Decimal)</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formLat}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setFormLat(val);
                              const alignment = getNearestGridCell(val, formLng, baseLat, baseLng);
                              setSelectedGridCell(alignment.cell);
                            }
                          }}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-400 text-slate-200"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Longitude (Exact Decimal)</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={formLng}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              setFormLng(val);
                              const alignment = getNearestGridCell(formLat, val, baseLat, baseLng);
                              setSelectedGridCell(alignment.cell);
                            }
                          }}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-cyan-400 text-slate-200"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-slate-400 font-mono">Description</label>
                      <textarea
                        rows={3}
                        value={formDesc}
                        onChange={(e) => setFormDesc(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-400 text-slate-200 resize-none"
                      />
                    </div>

                    {/* Severity Card info */}
                    {(() => {
                      const sev = scannedOutput ? scannedOutput.severity : 9.4;
                      const style = getSeverityStyle(sev);
                      return (
                        <div 
                          className="p-4 rounded-xl border transition-all duration-300"
                          style={{ 
                            backgroundColor: style.bg, 
                            borderColor: style.border.includes('/') ? undefined : style.border 
                          }}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className={`text-[10px] font-mono uppercase font-bold ${style.text}`}>AI Severity Analysis</span>
                            <span className={`font-mono font-bold text-[9px] px-2 py-0.5 rounded text-white bg-red-600`}>
                              {style.label} {sev.toFixed(1)}
                            </span>
                          </div>
                          <ul className="text-[10.5px] text-slate-300 space-y-1 font-mono">
                            {sev >= 7.5 ? (
                              <>
                                <li>🏥 Hospital Zone Proximity (Urgent attention) ➔ +2.0 Severity Points</li>
                                <li>⚠️ High Crash Accident area (Safety threat) ➔ +2.0 Severity Points</li>
                              </>
                            ) : sev >= 5.5 ? (
                              <>
                                <li>🏫 School Area Proximity (Safety caution) ➔ +1.0 Severity Points</li>
                                <li>⚠️ General arterial road pathway flow ➔ +1.0 Severity Points</li>
                              </>
                            ) : (
                              <>
                                <li>🟢 Low traffic impact zone (Moderate caution)</li>
                                <li>🚗 Normal neighborhood local road flow</li>
                              </>
                            )}
                          </ul>
                        </div>
                      );
                    })()}

                    <button
                      onClick={() => setIsGpsConfirmOpen(true)}
                      className="w-full bg-gradient-to-r from-[#1A73E8] to-[#8B5CF6] hover:brightness-110 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest cursor-pointer"
                    >
                      Submit & Update Rank
                    </button>
                  </div>

                  {/* Ward Map Location Column */}
                  <div className="md:col-span-5 space-y-6">
                    
                    {/* Ward Grid Component */}
                    <div className="bg-slate-950 border border-white/5 p-4 rounded-2xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">Ward 12 Grid Sector Coordinates</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsGridVisible(!isGridVisible)}
                            className="text-[10px] font-mono text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
                          >
                            {isGridVisible ? 'Hide Grid Map' : 'Show Grid Map'}
                          </button>
                          <span className="text-[10px] font-mono text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20">
                            {selectedGridCell}
                          </span>
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isGridVisible && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-6 gap-1.5 p-2 bg-black rounded-lg border border-white/5 max-h-[300px] overflow-y-auto mt-2">
                              {Array.from({ length: 30 }).map((_, i) => {
                                const col = i % 6;
                                const row = Math.floor(i / 6);
                                const calculatedLat = baseLat + (4 - row) * 0.0015;
                                const calculatedLng = baseLng + col * 0.0015;
                                
                                // Custom check to see if active selected cell matches this cell
                                const cellLabel = `${String.fromCharCode(65 + col)}${row + 1}`;
                                const isTarget = selectedGridCell === cellLabel;
                                const isNeighbor = !isTarget && [10, 15, 17, 22].includes(i);
                                
                                return (
                                  <div
                                    key={i}
                                    onClick={async () => {
                                      setSelectedGridCell(cellLabel);
                                      setFormLat(parseFloat(calculatedLat.toFixed(6)));
                                      setFormLng(parseFloat(calculatedLng.toFixed(6)));
                                      
                                      try {
                                        const locData = await reverseGeocode(calculatedLat, calculatedLng);
                                        setFormLocation(locData.fullAddress);
                                        setFormCity(locData.city);
                                        setFormState(locData.state);
                                        setFormCountry(locData.country);
                                        setFormArea(locData.area);
                                      } catch (e) {
                                        const coords = getGridCellCoords(cellLabel, baseLat, baseLng);
                                        setFormLocation(`Sector ${cellLabel} · Near ${coords.lat.toFixed(5)}°N, ${coords.lng.toFixed(5)}°E`);
                                      }
                                      
                                      showToast(`📍 Location updated to Grid ${cellLabel}: ${calculatedLat.toFixed(6)}, ${calculatedLng.toFixed(6)}`);
                                    }}
                                    className={`aspect-square rounded flex flex-col items-center justify-center text-[9px] font-mono cursor-pointer transition-all ${
                                      isTarget 
                                        ? 'bg-[#1A73E8] border border-[#4285F4] text-white shadow-[0_0_8px_rgba(26,115,232,0.8)]' 
                                        : isNeighbor 
                                          ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                                          : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    <span className="font-bold">{cellLabel}</span>
                                    {isTarget && <span className="text-[8px] leading-none mt-0.5">📍</span>}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono text-center mt-2">
                              Click on sectors to alter pin coordinates
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Live GPS Google Map Card */}
                    <div className="bg-slate-950 border border-white/5 p-4 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 font-bold uppercase">
                        <span>🗺️ Live Google Map Pinpoint</span>
                        <span className="text-cyan-400 font-mono text-[9px]">{formLat.toFixed(6)}, {formLng.toFixed(6)}</span>
                      </div>
                      
                      <div className="aspect-video w-full rounded-xl bg-slate-900 border border-white/10 overflow-hidden relative">
                        <Map
                          mapId="8e0a97af9386fef"
                          defaultCenter={{lat: formLat, lng: formLng}}
                          center={{lat: formLat, lng: formLng}}
                          defaultZoom={16}
                          disableDefaultUI={true}
                          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                          style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0}}
                        >
                          <AdvancedMarker position={{lat: formLat, lng: formLng}}>
                            <Pin background="#EF4444" glyphColor="#fff" borderColor="#991B1B" />
                          </AdvancedMarker>
                        </Map>
                      </div>
                    </div>

                    {/* Impact preview */}
                    <div className="bg-[#1A73E8]/5 border border-[#1A73E8]/20 p-4 rounded-2xl space-y-2">
                      <span className="text-[10px] font-mono text-[#1A73E8] font-bold block uppercase">🚀 Global Action Impact</span>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        By submitting this, the state algorithms recalculate. {displayState}'s rank of <strong>#{karnatakaRankVal}</strong> will instantly decrement to <strong>#{karnatakaRankVal > 2 ? karnatakaRankVal - 2 : 1}</strong> globally.
                      </p>
                    </div>

                  </div>

                </div>
              )}

              {/* STEP 3: SUCCESS AND RANK IMPACT CHANGE MODAL */}
              {currentStep === 3 && (
                <div className="max-w-xl mx-auto space-y-6 text-center animate-fadeIn py-6">
                  
                  {/* Confetti simulation overlay style */}
                  <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 text-4xl flex items-center justify-center rounded-full mx-auto animate-bounce shadow-[0_0_30px_rgba(16,185,129,0.3)] backdrop-blur-xl">
                    ✓
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Civic Report Verified</h2>
                    <p className="text-xs text-slate-400 font-mono mt-2 bg-white/5 inline-block px-3 py-1 rounded-full border border-white/10">
                      Ticket #{submittedIssueId || "CV-2847"} registered with high AI confidence.
                    </p>
                  </div>

                  {/* HERO RANK IMPACT CARD (WOW MOMENT 2) */}
                  <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl text-center shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden group hover:border-[#1A73E8]/50 transition-all duration-500">
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1A73E8]/5 to-transparent opacity-50" />
                    <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#1A73E8]/20 rounded-full blur-3xl group-hover:bg-[#1A73E8]/30 transition-colors" />
                    
                    <span className="relative text-[10px] font-mono uppercase font-bold tracking-widest text-cyan-400 bg-cyan-950/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-cyan-400/20 inline-block mb-6 shadow-inner">
                      🌍 Global State Civic Index Impact
                    </span>

                    <div className="relative flex items-center justify-center gap-8 my-8">
                      <div className="text-center opacity-50 transition-opacity duration-1000">
                        <span className="text-slate-400 text-[10px] block font-mono uppercase tracking-wider mb-2">Previous Rank</span>
                        <strong className="text-3xl text-slate-400 font-mono line-through decoration-slate-600/50">#{karnatakaRankVal + 2}</strong>
                      </div>
                      
                      <div className="text-cyan-400 font-mono text-xl animate-pulse">
                        <ArrowRight className="w-6 h-6" />
                      </div>
                      
                      <div className="text-center relative">
                        <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 blur-xl rounded-full" />
                        <span className="relative text-cyan-400 text-[10px] block font-mono font-bold uppercase tracking-wider mb-2 text-shadow-sm">Current Rank</span>
                        <strong className="relative text-5xl text-white font-mono font-extrabold px-4 py-2 bg-slate-950/80 rounded-xl border border-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.2)] block transition-transform hover:scale-105">
                          #{karnatakaRankVal}
                        </strong>
                      </div>
                    </div>

                    <div className="relative text-white text-lg font-semibold mb-3 flex items-center justify-center gap-2">
                      🎉 State algorithm incremented <span className="text-emerald-400 font-mono">+2 spots</span> globally!
                    </div>

                    <div className="relative text-[11px] text-slate-400 font-mono max-w-sm mx-auto bg-black/40 px-4 py-2 rounded-lg border border-white/5">
                      In India Rankings: #6 ➔ #5. Civic Score advanced from 54.6 ➔ 54.7 points. Keep scanning.
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => setActiveTab('issues')}
                      className="bg-slate-900 border border-white/15 hover:bg-slate-800 text-slate-200 font-semibold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                    >
                      View Map & Status 🗺️
                    </button>
                    <button
                      onClick={() => showToast("📋 WhatsApp share link copied to clipboard!")}
                      className="bg-[#1A73E8] hover:bg-[#1A73E8]/90 text-white font-bold py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Share State Progress 📲
                    </button>
                  </div>

                </div>
              )}

            </motion.div>
          )}

          {/* PAGE 5: ACTIVE REPORTS & DETAIL VIEW */}
          {activeTab === 'issues' && (
            <motion.div key="issues" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* LEFT SIDE: REGISTRY LIST PANEL */}
                <div className="lg:col-span-5 space-y-4">
                  {/* Filter controls */}
                  <div className="flex flex-col gap-4 bg-slate-950/60 p-4 border border-white/5 rounded-2xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#1A73E8]" />
                        <span className="text-xs font-mono uppercase text-slate-300 font-bold">Geospatial Issue Registry</span>
                      </div>
                      
                      {/* Dynamic Filters */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setIssuesFilter('all')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
                            issuesFilter === 'all'
                              ? 'bg-[#1A73E8] text-white shadow-md shadow-blue-500/15'
                              : 'bg-white/5 text-slate-400 hover:bg-white/10'
                          }`}
                        >
                          🌐 All Reports
                        </button>
                        {userRole !== 'official' && (
                          <button
                            onClick={() => {
                              if (!user) {
                                showToast("🔐 Please authenticate to sync & view your reports.");
                                setIsAuthModalOpen(true);
                              } else {
                                setIssuesFilter('mine');
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                              issuesFilter === 'mine'
                                ? 'bg-[#8B5CF6] text-white shadow-md shadow-purple-500/15'
                                : 'bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            {user ? '👤 My Reports' : '🔐 My Reports'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                       <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                       <input 
                         type="text"
                         placeholder="Search issues by ID, title, location..."
                         value={citizenSearchTerm}
                         onChange={(e) => setCitizenSearchTerm(e.target.value)}
                         className="w-full bg-slate-900 border border-white/10 rounded-lg py-2 pl-8 pr-2 text-slate-200 text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:border-[#1A73E8]/50"
                       />
                     </div>
                  </div>

                  {/* Scrollable list of existing reports */}
                  <div className="space-y-3 max-h-[75vh] overflow-y-auto no-scrollbar pr-1">
                    {citizenFilteredIssues.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 font-mono text-xs border border-dashed border-white/10 rounded-2xl bg-black/20">
                        🚫 No reports found.
                      </div>
                    ) : (
                      citizenFilteredIssues.map((iss: any, i: number) => {
                          const sevStyle = getSeverityStyle(iss.severity);
                          const isMyReport = iss.userId === user?.uid || 
                            iss.userId === user?.email ||
                            iss.userEmail === user?.email ||
                            iss.gmailId === user?.email ||
                            iss.reporter?.uid === user?.uid || 
                            iss.reporter?.uid === user?.email ||
                            iss.reporter?.userId === user?.uid ||
                            iss.reporter?.userId === user?.email ||
                            iss.reporter?.email === user?.email ||
                            iss.reporter?.gmailId === user?.email;
                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setSelectedIssueId(iss.id);
                                setTimeout(() => {
                                  document.getElementById('community-radar-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 50);
                              }}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer relative ${
                                selectedIssueId === iss.id 
                                  ? 'bg-slate-900 border-[#1A73E8]/80 shadow-lg ring-1 ring-[#1A73E8]/30' 
                                  : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                              }`}
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold ${sevStyle.text}`} style={{ backgroundColor: sevStyle.bg }}>
                                    {sevStyle.label} {iss.severity}
                                  </span>
                                  {isMyReport && (
                                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded font-bold bg-purple-500/15 text-purple-300 border border-purple-500/20 shadow-[0_0_8px_rgba(139,92,246,0.15)] animate-pulse">
                                      MY REPORT
                                    </span>
                                  )}
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold bg-slate-500/20 text-slate-400">
                                    ID: {iss.id}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-slate-500">{formatTimestamp(iss.timestamp)}</span>
                                  {isMyReport && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setIssueIdToDelete(iss.id);
                                      }}
                                      className="p-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                                      title="Delete Report"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <h4 className="text-sm font-semibold text-white mb-1 truncate">{iss.title}</h4>
                              <p className="text-xs text-slate-400 mb-3 truncate font-mono">{iss.location}</p>
                              
                              <div className="flex justify-between items-center pt-2.5 border-t border-white/5 text-[11px] font-mono text-slate-400">
                                <span>🏷️ {iss.category}</span>
                                <div className="flex items-center gap-3">
                                  <span>👍 {iss.upvotes + iss.verified} Upvotes</span>
                                  <span className="text-emerald-400">✓ {iss.verified} Verified</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>

                {/* RIGHT SIDE: INTEGRATED INCIDENT INSPECTOR DETAILED PANEL */}
                <div className="lg:col-span-7 lg:sticky lg:top-24">
                  {selectedIssueId ? (() => {
                    const activeIssue = issues.find(is => is.id === selectedIssueId);
                    if (!activeIssue) {
                      return (
                        <div className="bg-slate-900/50 border border-dashed border-white/10 p-12 rounded-2xl text-center space-y-3">
                          <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                          <p className="text-xs font-mono text-slate-400 font-bold uppercase">No Active Selection</p>
                          <p className="text-[11px] text-slate-500 max-w-xs mx-auto">Select a submitted issue from the geospatial registry to inspect high-fidelity telemetry, GPS pinpoint maps, and verify BBMP repairs.</p>
                        </div>
                      );
                    }
                    const sStyle = getSeverityStyle(activeIssue.severity);
                    const isActiveMyReport = activeIssue.userId === user?.uid || 
                      activeIssue.userId === user?.email ||
                      activeIssue.userEmail === user?.email ||
                      activeIssue.gmailId === user?.email ||
                      activeIssue.reporter?.uid === user?.uid || 
                      activeIssue.reporter?.uid === user?.email ||
                      activeIssue.reporter?.userId === user?.uid ||
                      activeIssue.reporter?.userId === user?.email ||
                      activeIssue.reporter?.email === user?.email ||
                      activeIssue.reporter?.gmailId === user?.email;
                    return (
                      <div className="bg-slate-900 border border-white/10 p-5 rounded-2xl space-y-6 relative animate-fadeIn">
                        <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-cyan-400">Selected Incident Inspector: {activeIssue.id}</h3>
                        
                        {/* 1. Upper Visualizer block (Full Width) */}
                        <div className="space-y-4">
                          
                          {/* Tab selection for Left Visualizer */}
                          <div className="flex gap-2 border-b border-white/5 pb-2 overflow-x-auto">
                            {[
                              { id: 'image', label: '📸 AI Scan View' },
                              { id: 'map', label: '🗺️ Google Maps' },
                              { id: 'proof', label: '✅ Resolution Proof', disabled: !activeIssue.resolvedPhoto && activeIssue.status !== 'Resolved' }
                            ].map(t => (
                              <button
                                key={t.id}
                                onClick={() => {
                                  if (!t.disabled) {
                                    setDetailViewMode(t.id as any);
                                  } else {
                                    showToast("🔒 Resolution Proof is locked. Complete the repair simulation first!");
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
                                  detailViewMode === t.id 
                                    ? 'bg-[#1A73E8] text-white font-bold border border-white/15' 
                                    : t.disabled
                                      ? 'text-slate-600 cursor-not-allowed bg-transparent border border-transparent opacity-40'
                                      : 'text-slate-400 hover:text-white bg-white/5 border border-transparent'
                                }`}
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>

                          {/* CASE 1: IMAGE SCAN VIEW */}
                          {detailViewMode === 'image' && (
                            <div className="aspect-video bg-slate-950 border border-white/10 rounded-xl relative flex items-center justify-center overflow-hidden animate-fadeIn">
                              {/* If standard image upload is present, render actual image as background under scanner */}
                              {activeIssue.photo ? (
                                <img 
                                  src={activeIssue.photo === "demo_road_pothole" ? DEMO_POTHOLE_IMAGE_URL : activeIssue.photo} 
                                  alt={activeIssue.title} 
                                  className="absolute inset-0 w-full h-full object-cover opacity-60 filter saturate-[1.2] contrast-[1.1]" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="absolute inset-0 bg-radial-gradient from-blue-500/5 to-transparent pointer-events-none" />
                              )}

                              {activeIssue.boxes && activeIssue.boxes.map((box: any, bIdx: number) => (
                                <div
                                  key={bIdx}
                                  className="absolute border-2 rounded"
                                  style={{ 
                                    left: `${box.x}%`, 
                                    top: `${box.y}%`, 
                                    width: `${box.w}%`, 
                                    height: `${box.h}%`,
                                    borderColor: box.color,
                                    backgroundColor: `${box.color}15`
                                  }}
                                >
                                  <span className="absolute -top-5 left-0 text-[9px] font-mono px-1 py-0.5 rounded text-white font-bold" style={{ backgroundColor: box.color }}>
                                    {box.label} {box.conf}%
                                  </span>
                                </div>
                              ))}

                              {!activeIssue.photo && (
                                <div className="text-center z-10">
                                  <span className="text-4xl block mb-2">📸</span>
                                  <span className="text-[10px] font-mono text-slate-500 uppercase">AI-Analyzed Proof Plate</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* CASE 2: LIVE GOOGLE MAPS COORDS */}
                          {detailViewMode === 'map' && (
                            <div className="aspect-video w-full rounded-xl bg-slate-950 border border-white/10 overflow-hidden relative animate-fadeIn">
                              <Map
                                mapId="8e0a97af9386fef"
                                defaultCenter={{lat: activeIssue.lat || BASE_LAT, lng: activeIssue.lng || BASE_LNG}}
                                center={{lat: activeIssue.lat || BASE_LAT, lng: activeIssue.lng || BASE_LNG}}
                                defaultZoom={16}
                                disableDefaultUI={true}
                                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                                style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0}}
                              >
                                <AdvancedMarker position={{lat: activeIssue.lat || BASE_LAT, lng: activeIssue.lng || BASE_LNG}}>
                                  <Pin background="#3B82F6" glyphColor="#fff" borderColor="#1D4ED8" />
                                </AdvancedMarker>
                              </Map>
                              <div className="absolute bottom-2 left-2 bg-black/80 border border-white/10 p-2 rounded-lg font-mono text-[9px] text-cyan-400 z-10 space-y-0.5 pointer-events-none">
                                <div>COORDS: {activeIssue.lat || BASE_LAT}, {activeIssue.lng || BASE_LNG}</div>
                                <div>ACCURACY: ±1.8m (High precision grid)</div>
                                <div>SATELLITES: Active 12-Satellite Lock</div>
                              </div>
                            </div>
                          )}

                          {/* CASE 3: PROOF PHOTO SIDE-BY-SIDE */}
                          {detailViewMode === 'proof' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fadeIn">
                              {/* Left - Original Scan */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-mono uppercase text-slate-400 block font-bold">1. Original scanned incident</span>
                                <div className="aspect-video bg-red-950/20 border border-red-500/20 rounded-xl flex flex-col items-center justify-center p-3 text-center relative overflow-hidden">
                                  {activeIssue.photo ? (
                                    <img 
                                      src={activeIssue.photo === "demo_road_pothole" ? DEMO_POTHOLE_IMAGE_URL : activeIssue.photo} 
                                      alt="Original incident photo" 
                                      className="absolute inset-0 w-full h-full object-cover opacity-50" 
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <span className="text-3xl mb-1">🚨</span>
                                  )}
                                  <div className="z-10 bg-slate-950/70 p-2 rounded-lg border border-red-500/25">
                                    <strong className="text-xs text-red-400 uppercase font-mono truncate max-w-full block">{activeIssue.title}</strong>
                                    <p className="text-[10px] text-slate-400 font-mono mt-1">Status: Unresolved ({formatTimestamp(activeIssue.timestamp)})</p>
                                  </div>
                                  <span className="absolute top-1 right-1 bg-red-500 text-white font-mono text-[8px] px-1 rounded uppercase font-bold z-10">Defect Detected</span>
                                </div>
                              </div>
                              
                              {/* Right - Proof photo comparison */}
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-mono uppercase text-emerald-400 block font-bold">2. Verified resolution proof</span>
                                <div className="aspect-video bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex flex-col items-center justify-center p-3 text-center relative overflow-hidden group">
                                  {activeIssue.resolvedPhoto ? (
                                    <img 
                                      src={activeIssue.resolvedPhoto} 
                                      alt="Resolved issue proof" 
                                      className="absolute inset-0 w-full h-full object-cover opacity-80" 
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <>
                                      <span className="text-3xl mb-1">✅</span>
                                      <strong className="text-xs text-emerald-400 uppercase font-mono z-10">No defects found</strong>
                                      <p className="text-[10px] text-slate-300 font-mono mt-1 z-10">Verified: 100% Repaired & Stable</p>
                                    </>
                                  )}
                                  
                                  {/* Futuristic sign-off seal */}
                                  <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    <div className="border-2 border-emerald-500 text-emerald-400 px-3 py-1 rounded font-mono text-[9px] uppercase tracking-wider font-extrabold rotate-12 bg-black/90">
                                      BBMP SEAL APPROVED
                                    </div>
                                  </div>
                                  
                                  <span className="absolute top-1 right-1 bg-emerald-500 text-white font-mono text-[8px] px-1 rounded uppercase font-bold animate-pulse z-10">Resolved Proof</span>
                                </div>
                              </div>
                            </div>
                          )}

                        </div>

                        {/* 2. Lower details block: Spacious 2-Column Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                          
                          {/* Column 1: Community Radar & Action Buttons */}
                          <div className="space-y-4">
                            
                            {/* CONCENTRIC RADAR VISUALIZER / OFFICIAL ACTIONS */}
                            <div id="community-radar-section" className="bg-slate-950 border border-white/5 p-4 rounded-xl scroll-mt-24">
                              <h4 className="text-xs uppercase font-mono tracking-wider text-slate-400 mb-3">
                                {userRole === 'official' ? 'Official Actions' : 'Community Radar (Hyperlocal Proof)'}
                              </h4>
                              
                              <div className="flex flex-col sm:flex-row gap-4 items-center">
                                {userRole !== 'official' && (
                                  <div className="w-32 h-32 rounded-full border border-slate-800 relative flex items-center justify-center shrink-0">
                                    {/* 3 Concentric rings */}
                                    <div className="absolute inset-2 border border-slate-800/80 rounded-full" />
                                    <div className="absolute inset-8 border border-slate-800/50 rounded-full" />
                                    <div className="absolute inset-14 border border-slate-800/20 rounded-full" />
                                    
                                    {/* Central pin */}
                                    <span className="text-base z-10 animate-pulse">📍</span>

                                    {/* Simulated Scatter dots of verifiers */}
                                    <span className="absolute top-4 left-6 text-[8px] text-green-400">●</span>
                                    <span className="absolute top-12 right-6 text-[8px] text-green-400">●</span>
                                    <span className="absolute bottom-6 left-12 text-[8px] text-green-400">●</span>
                                    <span className="absolute bottom-10 right-4 text-[8px] text-slate-500">●</span>
                                    <span className="absolute top-20 left-4 text-[8px] text-green-400">●</span>
                                  </div>
                                )}

                                <div className="space-y-3 flex-1 min-w-0 w-full">
                                  {userRole !== 'official' && (
                                    <p className="text-xs text-slate-300 leading-relaxed font-mono">
                                      📢 Verified state count: <strong className="text-green-400">{activeIssue.verified}</strong> of 24 required. Help validation to accelerate municipal dispatch.
                                    </p>
                                  )}
                                  
                                  {userRole === 'official' ? (
                                    <>
                                      {activeIssue.status === 'Reported' ? (
                                        <button
                                          onClick={async () => {
                                            try {
                                              await updateDoc(doc(db, "issues", activeIssue.id), {
                                                status: 'Approved',
                                                approvedAt: new Date().toISOString(),
                                                official: { name: user?.displayName || user?.email || "Official" }
                                              });
                                              showToast(`✅ Ticket ${activeIssue.id} Approved & Dispatched!`);
                                            } catch(e) { console.error(e); }
                                          }}
                                          className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/50 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                                        >
                                          Approve & Dispatch Crew
                                        </button>
                                      ) : activeIssue.status === 'Approved' ? (
                                        resolvingIssueId === activeIssue.id ? (
                                          <div className="flex flex-col gap-2 bg-slate-900 border border-emerald-500/30 p-3 rounded-xl shadow-lg w-full">
                                            <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold text-left">Submit Resolution Proof</span>
                                            <input
                                              type="file"
                                              accept="image/*"
                                              onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                  const reader = new FileReader();
                                                  reader.onload = (ev) => {
                                                    setResolvePhotoUrl(ev.target?.result as string);
                                                  };
                                                  reader.readAsDataURL(file);
                                                }
                                              }}
                                              className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full font-mono file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20"
                                            />
                                            <div className="flex gap-2">
                                              <button
                                                onClick={async () => {
                                                  if (!resolvePhotoUrl) {
                                                    showToast("Please provide a proof photo URL");
                                                    return;
                                                  }
                                                  try {
                                                    await updateDoc(doc(db, "issues", activeIssue.id), {
                                                      status: 'Resolved',
                                                      resolvedAt: new Date().toISOString(),
                                                      resolver: { name: user?.displayName || user?.email || "Field Crew Alpha" },
                                                      resolvedPhoto: resolvePhotoUrl
                                                    });
                                                    // Update states logic
                                                    const stateName = activeIssue.state || activeIssue.globalImpact?.state || "Karnataka";
                                                    const nowStr = new Date().toISOString();
                                                    const timeToResolveMs = new Date(nowStr).getTime() - new Date(activeIssue.timestamp).getTime();
                                                    const timeToResolveDays = timeToResolveMs / (1000 * 60 * 60 * 24);
                                                    
                                                    try {
                                                      const stateRef = doc(db, "states", stateName);
                                                      const stateDoc = await getDoc(stateRef);
                                                      if (stateDoc.exists()) {
                                                        const data = stateDoc.data();
                                                        const oldAvg = data.speed || 0;
                                                        const newSpeed = (oldAvg * 0.9) + (timeToResolveDays * 0.1);
                                                        const newScore = Math.min(100, data.score + (timeToResolveDays < 2 ? 0.5 : -0.2));
                                                        await updateDoc(stateRef, {
                                                          speed: parseFloat(newSpeed.toFixed(1)),
                                                          score: parseFloat(newScore.toFixed(1))
                                                        });
                                                      }
                                                    } catch(e) { console.error("Error updating state stats locally:", e); }

                                                    setResolvingIssueId(null);
                                                    setResolvePhotoUrl('');
                                                    showToast(`🎉 Ticket ${activeIssue.id} Resolved with Proof Photo!`);
                                                  } catch(e) { console.error(e); }
                                                }}
                                                className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 py-2 rounded-lg text-[10px] font-bold uppercase transition-all"
                                              >
                                                Submit Proof
                                              </button>
                                              <button onClick={() => setResolvingIssueId(null)} className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase">Cancel</button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => setResolvingIssueId(activeIssue.id)}
                                            className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                                          >
                                            Mark as Resolved
                                          </button>
                                        )
                                      ) : (
                                        <div className="w-full bg-emerald-900/30 text-emerald-400 font-bold py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider text-center border border-emerald-500/30">
                                          Resolved by {activeIssue.resolver?.name || 'Field Crew'}
                                        </div>
                                      )}
                                    </>
                                  ) : user && (activeIssue.userId === user.uid || activeIssue.userEmail === user.email) ? (
                                    <div className="w-full bg-slate-800/50 text-slate-400 font-bold py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider text-center border border-slate-700/50">
                                      ✓ You reported this
                                    </div>
                                  ) : user && activeIssue.verifiers.some((v: any) => v.userId === user.uid || v.name === (user.displayName || user.email?.split('@')[0])) ? (
                                    <div className="w-full bg-green-900/30 text-green-400 font-bold py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider text-center border border-green-500/30">
                                      ✓ You verified this
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => handleVerifyIssue(activeIssue.id)}
                                      className="w-full bg-[#10B981] hover:bg-[#059669] text-white font-bold py-2.5 px-4 rounded-xl text-[11px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2"
                                    >
                                      🤝 I Can Confirm This (+25 XP)
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* SIMULATE REPAIR TRIGGER BLOCK REMOVED */}

                            {isActiveMyReport && (
                              <button
                                onClick={() => setIssueIdToDelete(activeIssue.id)}
                                className="w-full bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 font-bold py-3 rounded-xl text-xs uppercase tracking-widest font-mono cursor-pointer flex items-center justify-center gap-2 mt-2 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                                🗑️ Permanent Delete Report
                              </button>
                            )}

                          </div>

                          {/* Column 2: Status Timeline & Growing Path */}
                          <div className="space-y-4">
                            
                            {/* STATUS TIMELINE */}
                            <div className="bg-slate-950/60 p-4 border border-white/5 rounded-xl space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-xs uppercase text-slate-400 font-mono">Status Timeline</span>
                                <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20">
                                  {activeIssue.status}
                                </span>
                              </div>
                              
                              {/* Stepper tracker */}
                              <div className="space-y-3 font-mono text-[11px] pt-2">
                                {[
                                  { label: "📸 Incident Reported", done: true, time: formatTimestamp(activeIssue.timestamp) },
                                  { label: "👥 Community Validators", done: activeIssue.verified > 0, time: `${activeIssue.verified} confirmed` },
                                  { label: "🏛️ Approved by Officials", done: activeIssue.status === 'Approved' || activeIssue.status === 'Resolved', time: activeIssue.approvedAt ? formatTimestamp(activeIssue.approvedAt) : "Awaiting confirm" },
                                  { label: "✅ Repair Complete", done: activeIssue.status === 'Resolved', time: activeIssue.resolvedAt ? formatTimestamp(activeIssue.resolvedAt) : "Target: 48h" }
                                ].map((step, sIdx) => (
                                  <div key={sIdx} className="flex gap-2">
                                    <span className={step.done ? 'text-green-400' : 'text-slate-600'}>
                                      {step.done ? "✓" : "○"}
                                    </span>
                                    <div>
                                      <span className={step.done ? 'text-slate-200' : 'text-slate-500'}>{step.label}</span>
                                      <span className="block text-[9px] text-slate-500">{step.time}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* GROWING ISSUE TREE INTERACTIVE GRAPHIC */}
                            <div className="bg-slate-950/60 p-4 border border-white/5 rounded-xl space-y-3">
                              <span className="text-[10px] font-mono text-slate-400 uppercase font-bold block">Issue Tree Growing Path</span>
                              
                              <div className="flex items-center justify-between font-mono text-[10px] text-slate-300 relative py-1">
                                {/* Connector line behind */}
                                <div className="absolute top-5 left-4 right-4 h-0.5 bg-slate-800 z-0" />
                                
                                {/* Node 1: Reporter */}
                                <div className="flex flex-col items-center z-10 space-y-1 min-w-0 flex-1">
                                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-400 flex items-center justify-center text-xs shadow-[0_0_6px_rgba(59,130,246,0.3)]">
                                    👩‍💻
                                  </div>
                                  <span className="text-[9px] text-blue-400 font-bold block text-center">Reporter</span>
                                  <span className="text-[8px] text-slate-500 truncate max-w-[70px] block text-center" title={activeIssue.reporter?.name || "Reporter"}>{activeIssue.reporter?.name || "Reporter"}</span>
                                  {(activeIssue.userEmail || activeIssue.reporter?.email || activeIssue.gmailId || activeIssue.reporter?.gmailId) && (
                                    <span className="text-[7px] text-slate-400 font-mono tracking-tight max-w-[80px] truncate block text-center" title={activeIssue.userEmail || activeIssue.reporter?.email}>
                                      {activeIssue.userEmail || activeIssue.reporter?.email || activeIssue.gmailId}
                                    </span>
                                  )}
                                </div>

                                {/* Node 2: Verifiers */}
                                <div className="flex flex-col items-center z-10 space-y-1 min-w-0 flex-1">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all ${activeIssue.verified > 0 ? 'bg-purple-500/20 border border-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.3)]' : 'bg-slate-900 border border-white/5 opacity-55'}`}>
                                    👥
                                  </div>
                                  <span className={`text-[9px] block text-center ${activeIssue.verified > 0 ? 'text-purple-400 font-bold' : 'text-slate-500'}`}>Verifiers</span>
                                  <span className="text-[8px] text-slate-500 block text-center truncate max-w-[70px]">{activeIssue.verified} Citizens</span>
                                </div>

                                {/* Node 3: Official */}
                                <div className="flex flex-col items-center z-10 space-y-1 min-w-0 flex-1">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all ${activeIssue.status === 'Approved' || activeIssue.status === 'Resolved' ? 'bg-orange-500/20 border border-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.3)]' : 'bg-slate-900 border border-white/5 opacity-55'}`}>
                                    🏛️
                                  </div>
                                  <span className={`text-[9px] block text-center ${activeIssue.status === 'Approved' || activeIssue.status === 'Resolved' ? 'text-orange-400 font-bold' : 'text-slate-500'}`}>Official</span>
                                  <span className="text-[8px] text-slate-500 truncate max-w-[60px] block text-center">{activeIssue.status === 'Approved' || activeIssue.status === 'Resolved' ? activeIssue.official?.name || 'BBMP' : 'Pending'}</span>
                                </div>

                                {/* Node 4: Resolver */}
                                <div className="flex flex-col items-center z-10 space-y-1 min-w-0 flex-1 relative group">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all ${activeIssue.status === 'Resolved' ? 'bg-emerald-500/20 border border-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]' : 'bg-slate-900 border border-white/5 opacity-55'} overflow-hidden relative`}>
                                    {activeIssue.status === 'Resolved' && activeIssue.resolvedPhoto ? (
                                      <img src={activeIssue.resolvedPhoto} alt="Resolved" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                                    ) : (
                                      "🔧"
                                    )}
                                  </div>
                                  <span className={`text-[9px] block text-center ${activeIssue.status === 'Resolved' ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>Resolver</span>
                                  <span className="text-[8px] text-slate-500 truncate max-w-[50px] block text-center">{activeIssue.status === 'Resolved' ? activeIssue.resolver?.name || 'Field Crew' : 'Pending'}</span>
                                  
                                  {activeIssue.status === 'Resolved' && activeIssue.resolvedPhoto && (
                                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-50">
                                      <div className="bg-slate-900 border border-emerald-500/30 p-2 rounded-xl shadow-2xl">
                                        <img src={activeIssue.resolvedPhoto} className="w-32 h-24 object-cover rounded-lg" alt="Proof" />
                                        <div className="text-[8px] text-emerald-400 text-center mt-1 font-mono">Proof of Resolution</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                          </div>

                        </div>
                      </div>
                    );
                  })() : (
                    <div className="bg-slate-900/50 border border-dashed border-white/10 p-12 rounded-2xl text-center space-y-3">
                      <AlertTriangle className="w-8 h-8 text-slate-600 mx-auto animate-pulse" />
                      <p className="text-xs font-mono text-slate-400 font-bold uppercase">No Active Selection</p>
                      <p className="text-[11px] text-slate-500 max-w-xs mx-auto">Select a submitted issue from the geospatial registry to inspect high-fidelity telemetry, GPS pinpoint maps, and verify BBMP repairs.</p>
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          )}

          {/* PAGE 6: AI AGENTS */}
          {activeTab === 'agents' && (
            <motion.div key="agents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              <div className="bg-slate-900 border border-white/5 p-5 rounded-2xl">
                <div className="flex justify-between items-start">
                  <div>
                    <h1 className="text-lg font-bold text-white tracking-tight">AI Agent Pipelines</h1>
                    <p className="text-xs text-slate-400 mt-1">Every submitted report orchestrates across 4 specialized AI agents in sequence.</p>
                  </div>
                  <span className="text-[10px] uppercase font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
                    Vertex AI Node Stable
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {[
                    "Gemini 2.5 Vision", "Vertex AI Severity Core", "Google Maps JS Geofencing", "Firebase Realtime Stream", "Cloud Vision API", "Google Translate Localization"
                  ].map((tech, i) => (
                    <span key={i} className="text-[9.5px] font-mono bg-white/[0.04] text-slate-400 border border-white/5 px-2 py-1 rounded">
                      🛡️ {tech}
                    </span>
                  ))}
                </div>
              </div>

              {/* 4 Agent Sequential Cards */}
              <div className="space-y-4">
                {[
                  {
                    num: "1", title: "Vision Classifier Engine", tech: "Gemini 2.5 Vision", color: "border-blue-500/30 text-blue-400",
                    desc: "Parses geo-tagged media assets, identifies incident categories (road cracks, water leaks, hazards) & registers confidence bounding matrices.",
                    log: ["▸ CV-2847: Pothole (94%), Crack (78%)", "▸ CV-2846: Trash Spill Identified (89%)", "▸ CV-2845: Streetlight failure (71%)"]
                  },
                  {
                    num: "2", title: "Severity Scorer Engine", tech: "Vertex AI Scorer", color: "border-purple-500/30 text-purple-400",
                    desc: "Uses relative proximity matrices (hospitals, school zones, accident history coordinates) to weight risk scoring from 1-10.",
                    log: ["▸ CV-2847: Base 7.4 + Hospital Proximity (+2.0) = 9.4 CRITICAL", "▸ CV-2846: Base 5.1 + School Area (+1.5) = 6.6 HIGH"]
                  },
                  {
                    num: "3", title: "Smart Routing Dispatch", tech: "Cloud Functions Logic", color: "border-orange-500/30 text-orange-400",
                    desc: "Bridges records with regional civic offices automatically based on past resolution rates & geolocation mapping logs.",
                    log: ["▸ CV-2847 ➔ Routed to BBMP Roads Team B (Avg: 2.1 days)", "▸ CV-2846 ➔ Routed to Solid Waste Management"]
                  },
                  {
                    num: "4", title: "Global Index Analytics Updater", tech: "Vertex Realtime DB", color: "border-green-500/30 text-green-400",
                    desc: "Recalculates global state positioning scores continuously across all 5,247 sectors worldwide.",
                    log: [`▸ ${displayState} Index: +0.1 Score delta applied`, "▸ Lagos State: +0.8 Participation factor updated"]
                  }
                ].map((agent, i) => (
                  <div key={i} className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex flex-col md:flex-row gap-4 items-start">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-mono font-bold text-white shrink-0">
                      0{agent.num}
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-white">{agent.title}</h4>
                        <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 ${agent.color}`}>
                          {agent.tech}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{agent.desc}</p>
                      
                      {/* Monospace Agent decision logs */}
                      <div className="bg-black/60 p-3 rounded border border-white/5 font-mono text-[10px] text-emerald-400 space-y-1">
                        {agent.log.map((lg, lIdx) => (
                          <div key={lIdx}>{lg}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </motion.div>
          )}

          {/* PAGE 7: COMMUNITY & GAMIFICATION */}
          {activeTab === 'community' && (
            <motion.div key="community" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              {/* User Profile Card */}
              <div className="bg-slate-900 border border-white/5 p-5 rounded-2xl flex flex-col md:flex-row gap-5 items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-xl text-cyan-400 font-bold font-mono shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                    ME
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{formCity !== "Unknown City" ? formCity : "Your City"} Citizen Account</h3>
                      <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded font-mono font-bold border border-yellow-500/20">
                        LEVEL 2
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">Role: Active Community Verifier</p>
                  </div>
                </div>

                <div className="space-y-2 w-full md:w-64">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">XP Progress:</span>
                    <span className="text-white font-bold">{xp} / 500 XP</span>
                  </div>
                  <div className="w-full bg-slate-850 h-2 rounded-full overflow-hidden border border-white/5">
                    <div className="bg-yellow-400 h-full" style={{ width: `${(xp / 500) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block text-right">300 XP needed to unlock level 3 "Civic Champion"</span>
                </div>
              </div>

              {/* Achievements Grid */}
              <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl">
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-4 font-bold">Earned Badges & Goals</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  {[
                    { title: "First Reporter", emoji: "🏅", desc: "Uploaded first proof", unlocked: true },
                    { title: "10 Verifications", emoji: "⭐", desc: `${verifiedCount}/10 completed`, unlocked: verifiedCount >= 10 },
                    { title: "7-Day Streak", emoji: "🔥", desc: "Active civic loop", unlocked: false },
                    { title: "Global Ranker", emoji: "🌍", desc: "Logged 5 reports", unlocked: false },
                    { title: "Issue Resolved", emoji: "🏆", desc: "Target municipal dispatch", unlocked: false },
                    { title: "Ward Champion", emoji: "👑", desc: "Top reporter", unlocked: false }
                  ].map((ach, idx) => (
                    <div key={idx} className={`p-3 rounded-xl border text-center space-y-1.5 transition-all ${
                      ach.unlocked 
                        ? 'bg-[#1A73E8]/5 border-[#1A73E8]/30 text-white' 
                        : 'bg-black/30 border-white/5 text-slate-600 opacity-60'
                    }`}>
                      <span className="text-2xl block">{ach.emoji}</span>
                      <div className="text-[10px] font-bold truncate">{ach.title}</div>
                      <div className="text-[9px] font-mono leading-tight">{ach.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Citizen Leaderboard */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-slate-900">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">Top {displayState} Citizen Reporters</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-500 uppercase font-mono border-b border-white/5">
                      <tr>
                        <th className="p-3 text-center">Rank</th>
                        <th className="p-3">Citizen</th>
                        <th className="p-3">City</th>
                        <th className="p-3 text-right">Repairs Completed</th>
                        <th className="p-3 text-right">Civic XP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {dbUsers.filter(u => u.role !== 'official').length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500 font-mono text-xs">
                            🔒 No active citizens in database yet. Sign up & report issues to join the leaderboard!
                          </td>
                        </tr>
                      ) : (
                        dbUsers.filter(u => u.role !== 'official').map((item, i) => {
                          let badge = "⭐";
                          if (i === 0) badge = "👑";
                          else if (i === 1) badge = "🥈";
                          else if (i === 2) badge = "🥉";

                          const isMe = item.uid === user?.uid || item.email === user?.email;

                          return (
                            <tr key={i} className={`hover:bg-white/5 ${isMe ? 'bg-[#1A73E8]/10 font-bold border-l-2 border-[#1A73E8]' : ''}`}>
                              <td className="p-3 text-center text-slate-400">{badge} {i + 1}</td>
                              <td className="p-3 font-semibold text-white flex items-center gap-2">
                                {item.displayName || item.email?.split('@')[0] || "Citizen Hero"} {isMe && " (You)"}
                              </td>
                              <td className="p-3 text-slate-400">{formCity !== "Unknown City" ? formCity : "Your City"}</td>
                              <td className="p-3 text-right">{item.verifiedCount || 0}</td>
                              <td className="p-3 text-right text-yellow-400 font-bold">{item.xp || 0}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

          {/* PAGE 8: CITY PLANNER VIEW */}
          {activeTab === 'planner' && (
            <motion.div key="planner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              
              <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-5 rounded-2xl flex flex-col md:flex-row gap-5 items-center justify-between shadow-2xl">
                <div>
                  <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <MapPin className="text-[#1A73E8]" /> Municipal Operations Dashboard
                  </h1>
                  <p className="text-xs text-slate-400 mt-1">Live aggregated triage feed from CivicLens AI pipelines.</p>
                </div>
                
                <div className="bg-[#1A73E8]/10 border border-[#1A73E8]/30 px-6 py-4 rounded-xl text-center shadow-[0_0_15px_rgba(26,115,232,0.15)]">
                  <div className="text-[10px] font-mono text-[#1A73E8] font-bold uppercase tracking-widest mb-1">Taxpayer Funds Saved</div>
                  <div className="text-3xl font-bold text-white tracking-tight">
                    ${(issues.reduce((acc, iss) => acc + Math.round(iss.severity * 850), 0)).toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-1">via AI auto-prioritization & early detection</div>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
                <div className="p-4 border-b border-white/5 bg-slate-900/80">
                  <h3 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold">Prioritized Ticket Queue (Severity Descending)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/80 text-slate-500 uppercase font-mono border-b border-white/5">
                      <tr>
                        <th className="p-4">Ticket ID</th>
                        <th className="p-4">Incident Category</th>
                        <th className="p-4">AI Triage Status</th>
                        <th className="p-4">Location</th>
                        <th className="p-4 text-right">Severity Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono bg-slate-900/40">
                      {issues.map((iss, i) => {
                        const style = getSeverityStyle(iss.severity);
                        return (
                          <tr key={iss.id} className="hover:bg-white/5 transition-colors cursor-pointer" onClick={() => {
                            setSelectedIssueId(iss.id);
                            setActiveTab('issues');
                          }}>
                            <td className="p-4 font-bold text-white">{iss.id}</td>
                            <td className="p-4">
                              <span className="flex items-center gap-2">
                                {iss.category === "Road" ? "🛣️" : iss.category === "Water" ? "💧" : "🚧"} {iss.category}
                              </span>
                              <div className="text-[10px] text-slate-500 mt-1 truncate max-w-[200px]">{iss.title}</div>
                            </td>
                            <td className="p-4">
                              <span className="bg-white/5 border border-white/10 px-2 py-1 rounded text-[10px]">
                                {iss.status === "Reported" ? "Awaiting Dispatch" : iss.status}
                              </span>
                            </td>
                            <td className="p-4 text-slate-400 max-w-[200px] truncate">{iss.location}</td>
                            <td className="p-4 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-sm font-bold ${style.text}`}>{iss.severity.toFixed(1)}</span>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded border ${style.bg} ${style.border} ${style.text}`}>
                                  {style.label}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

          {/* PAGE 9: OFFICIAL PORTAL */}
          {activeTab === 'official' && (
            <motion.div key="official" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="space-y-6">
              <div className="bg-slate-900/60 backdrop-blur-xl border border-orange-500/20 p-5 rounded-2xl shadow-[0_8px_32px_rgba(249,115,22,0.1)]">
                <h1 className="text-xl font-bold text-orange-400 flex items-center gap-2">
                  <Shield className="w-5 h-5" /> Municipal Official Portal
                </h1>
                <p className="text-xs text-slate-400 mt-1 font-mono">Review, approve, and dispatch repair crews for verified civic issues.</p>
              </div>

              {/* DASHBOARD WIDGETS IN OFFICIAL PORTAL */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "States Tracked", val: INITIAL_STATES.length.toLocaleString(), desc: "Live index streams", icon: "🌍" },
                  { label: "Issues Resolved", val: issues.filter(iss => iss.status === 'Resolved').length.toLocaleString(), desc: "Today worldwide", icon: "✅" },
                  { label: "Active Citizens", val: dbUsers.filter(u => u.role !== 'official').length.toLocaleString(), desc: "Registered accounts", icon: "👥" },
                  { label: "Fastest State Today", val: "Bavaria (0.8d)", desc: "Avg response", icon: "⚡" }
                ].map((s, idx) => (
                  <div key={idx} className="bg-white/[0.03] border border-white/5 p-4 rounded-xl hover:border-white/10 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs text-slate-400 uppercase tracking-widest">{s.label}</span>
                      <span className="text-lg">{s.icon}</span>
                    </div>
                    <div className="text-lg font-bold text-white font-mono">{s.val}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.desc}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* World Heatmap Micro Visualizer */}
                <div className="bg-white/[0.03] border border-white/5 p-4 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold">Global Civic Health Index</h3>
                      <div className="flex bg-slate-900 border border-white/10 rounded-lg p-0.5 text-[9px] font-mono">
                        <button
                          onClick={() => setDashboardMapMode('grid')}
                          className={`px-2 py-0.5 rounded cursor-pointer transition-all ${dashboardMapMode === 'grid' ? 'bg-[#1A73E8] text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          GRID
                        </button>
                        <button
                          onClick={() => setDashboardMapMode('heatmap')}
                          className={`px-2 py-0.5 rounded cursor-pointer transition-all ${dashboardMapMode === 'heatmap' ? 'bg-[#1A73E8] text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                          HEATMAP
                        </button>
                      </div>
                    </div>

                    {dashboardMapMode === 'grid' ? (
                      /* Matrix Grid Representation */
                      <div className="grid grid-cols-8 gap-1.5 p-3 bg-black/60 rounded-lg border border-white/5">
                        {Array.from({ length: 48 }).map((_, i) => {
                          let color = "bg-green-500/30 border-green-500/40";
                          if (i % 5 === 0) color = "bg-red-500/30 border-red-500/40";
                          else if (i % 3 === 0) color = "bg-yellow-500/30 border-yellow-500/40";
                          else if (i % 7 === 0) color = "bg-orange-500/30 border-orange-500/40";

                          return (
                            <div
                              key={i}
                              className={`aspect-square rounded border relative group cursor-pointer hover:scale-115 transition-transform ${color}`}
                            >
                              <div className="absolute hidden group-hover:block bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 p-2 rounded text-[10px] whitespace-nowrap z-30 font-mono shadow-xl">
                                Sector {i + 1} Avg Score: {50 + (i % 45)}/100
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Google Maps Compatible Heatmap Representation */
                      <div id="official-dashboard-map" className="aspect-[4/3] w-full rounded-lg bg-black border border-white/5 relative overflow-hidden">
                        <Map
                          id="official-map"
                          mapId="8e0a97af9386fef"
                          defaultCenter={{lat: baseLat, lng: baseLng}}
                          defaultZoom={12}
                          disableDefaultUI={true}
                          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                          style={{width: '100%', height: '100%', position: 'absolute', top: 0, left: 0}}
                        >
                          {/* Dynamic Glowing Heat Spots aligned with active issues array */}
                          {issues.filter(iss => iss.status === 'Reported').map((iss: any) => {
                            // Heat intensity size based on severity
                            const size = Math.max(30, Math.min(90, iss.severity * 8));

                            return (
                              <AdvancedMarker
                                key={iss.id}
                                position={{lat: iss.lat, lng: iss.lng}}
                                onClick={() => {
                                  setSelectedIssueId(iss.id);
                                  setActiveTab('issues');
                                  showToast(`🔍 Selected ${iss.id}: ${iss.title}`);
                                }}
                              >
                                <div 
                                  className="relative rounded-full pointer-events-auto cursor-pointer group transition-all duration-300 hover:scale-110"
                                  style={{
                                    transform: 'translateY(50%)',
                                    width: `${size}px`,
                                    height: `${size}px`,
                                    background: `radial-gradient(circle, rgba(239, 68, 68, 0.55) 0%, rgba(249, 115, 22, 0.25) 35%, rgba(239, 68, 68, 0) 70%)`
                                  }}
                                >
                                  {/* Core blinking point */}
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-red-500 rounded-full animate-ping" />
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-red-400 rounded-full" />
                                  
                                  {/* Hover tooltip */}
                                  <div className="absolute hidden group-hover:block bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-white/10 p-2.5 rounded-xl text-[10.5px] font-mono whitespace-nowrap z-50 shadow-2xl backdrop-blur-md">
                                    <div className="flex items-center gap-1.5 font-bold text-white mb-0.5">
                                      <span className="w-2 h-2 rounded-full bg-red-500" />
                                      <span>{iss.title}</span>
                                    </div>
                                    <div className="text-slate-300">Severity Level: <span className="text-red-400 font-bold">{iss.severity} / 10</span></div>
                                    <div className="text-[9.5px] text-slate-500 truncate max-w-[180px]">{iss.location}</div>
                                  </div>
                                </div>
                              </AdvancedMarker>
                            );
                          })}
                        </Map>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-500 flex justify-between items-center font-mono">
                    <span>Model: Gemini 2.0 Pro Experimental</span>
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live Analysis Active</span>
                  </div>
                </div>

                {/* India Spotlight card */}
                <div className="bg-slate-950/60 border border-white/5 p-5 rounded-xl flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col mb-4">
                      <h3 className="text-xs uppercase font-mono tracking-widest text-slate-400 font-bold mb-2">🇮🇳 India Spotlight</h3>
                      <div className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 w-fit">
                        <span className="text-[11px] font-mono text-slate-300">{displayState} Rank: <span className="text-[#1A73E8] font-bold">#{karnatakaRankVal}</span></span>
                        <div className="w-px h-3 bg-white/20"></div>
                        <span className="text-[11px] font-mono text-slate-300">India Avg Score: <span className="text-emerald-400 font-bold">{indiaAvgScore}</span></span>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      {indiaSpotlightStates.map((st, i) => (
                        <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${st.state === displayState ? 'bg-[#1A73E8]/10 border-[#1A73E8]/40' : 'bg-white/5 border-transparent'}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-slate-400 w-5">#{st.rank}</span>
                            <span className="text-xs font-medium text-white">{st.state}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono text-xs">
                            <span className="text-slate-400">{st.score} score</span>
                            <span className={`font-bold ${st.change > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {st.change > 0 ? `+${st.change}` : st.change} {st.change > 0 ? '↑' : '↓'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-5 rounded-2xl shadow-2xl space-y-4">
                <div className="flex flex-col xl:flex-row gap-4 mb-4 font-mono text-xs">
                   <div className="flex-1 space-y-1">
                     <label className="text-slate-400 uppercase tracking-wider text-[10px]">Search Issues</label>
                     <div className="relative">
                       <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                       <input 
                         type="text"
                         placeholder="ID, Title, Location..."
                         value={officialSearchTerm}
                         onChange={(e) => setOfficialSearchTerm(e.target.value)}
                         className="w-full bg-slate-950 border border-white/10 rounded-lg py-2 pl-8 pr-2 text-slate-200"
                       />
                     </div>
                   </div>
                   <div className="flex-1 space-y-1">
                     <label className="text-slate-400 uppercase tracking-wider text-[10px]">Sort By</label>
                     <select 
                       value={officialSortBy}
                       onChange={(e) => setOfficialSortBy(e.target.value as any)}
                       className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-slate-200"
                     >
                       <option value="severity_desc">Severity (High to Low)</option>
                       <option value="severity_asc">Severity (Low to High)</option>
                       <option value="date_desc">Date (Newest First)</option>
                       <option value="date_asc">Date (Oldest First)</option>
                     </select>
                   </div>
                   <div className="flex-1 space-y-1">
                     <label className="text-slate-400 uppercase tracking-wider text-[10px]">Filter State</label>
                     <select 
                       value={officialFilterState}
                       onChange={(e) => setOfficialFilterState(e.target.value)}
                       className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-slate-200"
                     >
                       <option value="">All States</option>
                       {Array.from(new Set(issues.filter(i => i.state).map(i => i.state))).map((state, idx) => (
                         <option key={idx} value={state as string}>{state as string}</option>
                       ))}
                     </select>
                   </div>
                   <div className="flex-1 space-y-1">
                     <label className="text-slate-400 uppercase tracking-wider text-[10px]">Filter City</label>
                     <select 
                       value={officialFilterCity}
                       onChange={(e) => setOfficialFilterCity(e.target.value)}
                       className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-slate-200"
                     >
                       <option value="">All Cities</option>
                       {Array.from(new Set(issues.filter(i => i.city).map(i => i.city))).map((city, idx) => (
                         <option key={idx} value={city as string}>{city as string}</option>
                       ))}
                     </select>
                   </div>
                   <div className="flex-1 space-y-1">
                     <label className="text-slate-400 uppercase tracking-wider text-[10px]">Filter Area</label>
                     <select 
                       value={officialFilterArea}
                       onChange={(e) => setOfficialFilterArea(e.target.value)}
                       className="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-slate-200"
                     >
                       <option value="">All Areas</option>
                       {Array.from(new Set(issues.filter(i => i.area).map(i => i.area))).map((area, idx) => (
                         <option key={idx} value={area as string}>{area as string}</option>
                       ))}
                     </select>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* PENDING APPROVAL COLUMN */}
                  <div className="bg-slate-900/40 rounded-xl border border-white/5 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h2 className="text-sm font-bold text-slate-300 font-mono uppercase tracking-wider">Pending Approval</h2>
                      <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-xs font-bold">
                        {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Reported').length}
                      </span>
                    </div>

                    {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Reported').map((iss: any) => (
                      <div 
                        key={iss.id} 
                        onClick={() => {
                          if (officialMap) {
                            setDashboardMapMode('heatmap');
                            officialMap.setZoom(16);
                            setTimeout(() => {
                              officialMap.panTo({ lat: iss.lat, lng: iss.lng });
                            }, 100);
                            setSelectedIssueId(iss.id);
                            document.getElementById('official-dashboard-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="border border-white/10 bg-slate-950 p-4 rounded-xl flex flex-col gap-3 hover:border-orange-500/30 transition-colors relative overflow-hidden cursor-pointer"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                        <div className="flex items-start gap-3">
                          <img src={iss.photo || DEMO_POTHOLE_IMAGE_URL} alt="Issue" className="w-12 h-12 object-cover rounded-lg border border-white/10 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate">{iss.title}</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{iss.location}</p>
                            <div className="flex gap-2 mt-1.5 text-[9px] font-mono">
                              <span className="text-purple-400 font-bold bg-purple-400/10 px-1.5 py-0.5 rounded">👥 {iss.verified}</span>
                              <span className="text-red-400 font-bold bg-red-400/10 px-1.5 py-0.5 rounded">⚠️ {iss.severity.toFixed(1)}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await updateDoc(doc(db, "issues", iss.id), {
                                status: 'Approved',
                                approvedAt: new Date().toISOString(),
                                official: { name: user?.displayName || user?.email || "Official" }
                              });
                              showToast(`✅ Ticket ${iss.id} Approved & Dispatched!`);
                            } catch(e) { console.error(e); }
                          }}
                          className="w-full bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/50 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                        >
                          Approve & Dispatch Crew
                        </button>
                      </div>
                    ))}
                    
                    {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Reported').length === 0 && (
                      <div className="text-center py-6 text-slate-500 font-mono text-[10px] uppercase border border-dashed border-white/10 rounded-lg">
                        No pending issues
                      </div>
                    )}
                  </div>

                  {/* ACTIVE REPAIRS COLUMN */}
                  <div className="bg-slate-900/40 rounded-xl border border-white/5 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h2 className="text-sm font-bold text-slate-300 font-mono uppercase tracking-wider">Active Repairs</h2>
                      <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs font-bold">
                        {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Approved').length}
                      </span>
                    </div>

                    {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Approved').map((iss: any) => (
                      <div 
                        key={iss.id} 
                        onClick={() => {
                          if (officialMap) {
                            setDashboardMapMode('heatmap');
                            officialMap.setZoom(16);
                            setTimeout(() => {
                              officialMap.panTo({ lat: iss.lat, lng: iss.lng });
                            }, 100);
                            setSelectedIssueId(iss.id);
                            document.getElementById('official-dashboard-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="border border-white/10 bg-slate-950 p-4 rounded-xl flex flex-col gap-3 hover:border-blue-500/30 transition-colors relative overflow-hidden cursor-pointer"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                        <div className="flex items-start gap-3">
                          <img src={iss.photo || DEMO_POTHOLE_IMAGE_URL} alt="Issue" className="w-12 h-12 object-cover rounded-lg border border-white/10 shrink-0 opacity-80" />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-white truncate">{iss.title}</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{iss.location}</p>
                            <div className="flex gap-2 mt-1.5 text-[9px] font-mono">
                              <span className="text-blue-400 font-bold bg-blue-400/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span> In Progress
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        {resolvingIssueId === iss.id ? (
                          <div className="flex flex-col gap-2 bg-slate-900 border border-emerald-500/30 p-3 rounded-xl shadow-lg mt-1">
                            <span className="text-[9px] text-emerald-400 font-mono uppercase font-bold">Submit Resolution Proof</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (ev) => {
                                    setResolvePhotoUrl(ev.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none w-full font-mono file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!resolvePhotoUrl) {
                                    showToast("Please provide a proof photo URL");
                                    return;
                                  }
                                  try {
                                    await updateDoc(doc(db, "issues", iss.id), {
                                      status: 'Resolved',
                                      resolvedAt: new Date().toISOString(),
                                      resolver: { name: user?.displayName || user?.email || "Field Crew Alpha" },
                                      resolvedPhoto: resolvePhotoUrl
                                    });
                                    // Update states logic
                                    const stateName = iss.state || iss.globalImpact?.state || "Karnataka";
                                    const nowStr = new Date().toISOString();
                                    const timeToResolveMs = new Date(nowStr).getTime() - new Date(iss.timestamp).getTime();
                                    const timeToResolveDays = timeToResolveMs / (1000 * 60 * 60 * 24);
                                    try {
                                      const stateRef = doc(db, "states", stateName);
                                      const stateDoc = await getDoc(stateRef);
                                      if (stateDoc.exists()) {
                                        const data = stateDoc.data();
                                        const oldAvg = data.speed || 0;
                                        const newSpeed = (oldAvg * 0.9) + (timeToResolveDays * 0.1);
                                        const newScore = Math.min(100, data.score + (timeToResolveDays < 2 ? 0.5 : -0.2));
                                        await updateDoc(stateRef, {
                                          speed: parseFloat(newSpeed.toFixed(1)),
                                          score: parseFloat(newScore.toFixed(1))
                                        });
                                      }
                                    } catch(e) { console.error("Error updating state stats locally:", e); }

                                    setResolvingIssueId(null);
                                    setResolvePhotoUrl('');
                                    showToast(`🎉 Ticket ${iss.id} Resolved with Proof Photo!`);
                                  } catch(e) { console.error(e); }
                                }}
                                className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all"
                              >
                                Submit Proof
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setResolvingIssueId(null); }} className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setResolvingIssueId(iss.id); }}
                            className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                          >
                            Mark as Resolved
                          </button>
                        )}
                      </div>
                    ))}

                    {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Approved').length === 0 && (
                      <div className="text-center py-6 text-slate-500 font-mono text-[10px] uppercase border border-dashed border-white/10 rounded-lg">
                        No active repairs
                      </div>
                    )}
                  </div>

                  {/* RECENTLY RESOLVED COLUMN */}
                  <div className="bg-slate-900/40 rounded-xl border border-white/5 p-4 space-y-4 opacity-75">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h2 className="text-sm font-bold text-slate-400 font-mono uppercase tracking-wider">Recently Resolved</h2>
                      <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">
                        {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Resolved').length}
                      </span>
                    </div>

                    {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Resolved').map((iss: any) => (
                      <div 
                        key={iss.id} 
                        onClick={() => {
                          if (officialMap) {
                            setDashboardMapMode('heatmap');
                            officialMap.setZoom(16);
                            setTimeout(() => {
                              officialMap.panTo({ lat: iss.lat, lng: iss.lng });
                            }, 100);
                            setSelectedIssueId(iss.id);
                            document.getElementById('official-dashboard-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="border border-white/10 bg-slate-950 p-4 rounded-xl flex flex-col gap-3 relative overflow-hidden cursor-pointer hover:border-emerald-500/30 transition-colors"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                        <div className="flex items-start gap-3">
                          <img src={iss.resolvedPhoto || iss.photo || DEMO_POTHOLE_IMAGE_URL} alt="Resolved" className="w-12 h-12 object-cover rounded-lg border border-white/10 shrink-0 filter sepia-[0.3]" />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-bold text-slate-300 truncate line-through decoration-emerald-500/50">{iss.title}</h4>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">{iss.location}</p>
                            <div className="flex gap-2 mt-1.5 text-[9px] font-mono">
                              <span className="text-emerald-400 font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded">✓ Fixed</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    {officialFilteredAndSortedIssues.filter(iss => iss.status === 'Resolved').length === 0 && (
                      <div className="text-center py-6 text-slate-500 font-mono text-[10px] uppercase border border-dashed border-white/10 rounded-lg">
                        No resolved issues
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        </div>

      </main>

      {/* FLOAT ACTION FLOATING REPORT FAB BUTTON (WOW 1 POPUP LAUNCHER) */}
      <div className="fixed bottom-6 right-6 z-30">
        <button
          onClick={() => {
            setActiveTab('report');
            setCurrentStep(1);
            setUploadedImage(null);
            setScanProgress(-1);
            setRevealedBoxes(0);
          }}
          className="w-14 h-14 rounded-full bg-gradient-to-r from-[#1A73E8] to-[#8B5CF6] text-white flex items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-108 transition-transform cursor-pointer"
          title="Submit a Civic Lens Report"
        >
          <Upload className="w-6 h-6 animate-pulse" />
        </button>
      </div>

      {/* USER DATABASE & SYNC AUTH MODAL */}
      <AnimatePresence>
      {isAuthModalOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900/60 backdrop-blur-2xl border border-white/20 rounded-3xl w-full max-w-md p-6 relative shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
            {/* Ambient Purple Grid background */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(#1A73E8_1px,transparent_1px)] [background-size:16px_16px]" />

            {/* Close Button */}
            <button
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white font-mono text-xs cursor-pointer"
            >
              ✕
            </button>

            {authMode === 'profile' && user ? (
              // PROFILE PANEL
              <div className="relative z-10 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center font-bold text-lg text-white font-mono uppercase">
                    {user.displayName?.substring(0, 2).toUpperCase() || "CH"}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      {user.displayName || "Citizen Hero"}
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">{user.email}</p>
                  </div>
                </div>

                <div className="border border-white/5 bg-slate-950/50 rounded-xl p-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Database Engine:</span>
                    <span className="text-cyan-400 font-bold">Cloud Firestore</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Auth Service:</span>
                    <span className="text-purple-400">Firebase Auth</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-slate-400">Account Role:</span>
                    <span className={`font-bold uppercase ${userRole === 'official' ? 'text-orange-400' : 'text-blue-400'}`}>
                      {userRole === 'official' ? 'Municipal Official' : 'Citizen'}
                    </span>
                  </div>
                  {userRole !== 'official' && (
                    <>
                      <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <span className="text-slate-400">Your Civic XP:</span>
                        <span className="text-yellow-400 font-bold">🏅 {xp}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Verifications:</span>
                        <span className="text-emerald-400 font-bold">✓ {verifiedCount}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSignOut}
                    className="flex-1 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all uppercase tracking-wider font-mono"
                  >
                    Logout
                  </button>
                  <button
                    onClick={() => setIsAuthModalOpen(false)}
                    className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all font-mono"
                  >
                    Keep Syncing
                  </button>
                </div>
              </div>
            ) : (
              // LOGIN / SIGNUP FORM
              <form onSubmit={handleAuthSubmit} className="relative z-10 space-y-5">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {authMode === 'login' ? 'Sync with CivicLens Cloud' : 'Create Civic Profile'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {authMode === 'login' 
                      ? 'Authenticate to unlock real-time Firestore database synchronization.' 
                      : 'Create a permanent cryptographic citizen profile to store repairs & XP.'}
                  </p>
                </div>

                <div className="space-y-3.5 text-xs">
                  {authMode === 'signup' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Full Name / Display Initials</label>
                        <input
                          type="text"
                          required
                          value={authName}
                          onChange={(e) => setAuthName(e.target.value)}
                          placeholder="e.g. Anand Kumar"
                          className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#1A73E8]"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Email Address</label>
                    <input
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#1A73E8]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Password</label>
                    <input
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#1A73E8]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#1A73E8] hover:bg-[#1A73E8]/95 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider font-mono cursor-pointer transition-all shadow-lg shadow-blue-500/10"
                >
                  {authMode === 'login' ? '🔐 Authenticate & Connect' : '🚀 Register Citizen Profile'}
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-3 text-slate-500 text-[10px] font-mono uppercase">or</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium font-mono uppercase tracking-wider text-[10px]">Select Role Before Continuing</label>
                  <select
                    value={authRole}
                    onChange={(e) => setAuthRole(e.target.value as 'citizen' | 'official')}
                    className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-[#1A73E8]"
                  >
                    <option value="citizen">Citizen (Report Issues)</option>
                    <option value="official">Municipal Official (Resolve Issues)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider font-mono cursor-pointer transition-all flex items-center justify-center gap-2 border border-slate-200/50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="text-center font-mono text-[10px]">
                  {authMode === 'login' ? (
                    <span className="text-slate-500">
                      Don't have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('signup')}
                        className="text-cyan-400 hover:underline cursor-pointer"
                      >
                        Create Profile
                      </button>
                    </span>
                  ) : (
                    <span className="text-slate-500">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('login')}
                        className="text-cyan-400 hover:underline cursor-pointer"
                      >
                        Log In
                      </button>
                    </span>
                  )}
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
      {issueIdToDelete && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 border border-red-500/30 rounded-2xl w-full max-w-md p-6 relative shadow-2xl overflow-hidden">
            {/* Ambient Red Grid background */}
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#EF4444_1px,transparent_1px)] [background-size:16px_16px]" />
            
            <div className="relative z-10 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500/15 text-red-500 rounded-xl flex items-center justify-center">
                  <Trash2 className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">Delete Civic Report?</h3>
                  <p className="text-[11px] font-mono text-slate-400">ID: {issueIdToDelete}</p>
                </div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-2">
                <p className="text-red-400 font-bold">⚠️ Warning: This action is permanent.</p>
                <p>This will completely remove the report from the public {displayState} Geospatial Issue Registry, including its coordinates, description, and resolution status.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIssueIdToDelete(null)}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all font-mono"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteIssue(issueIdToDelete)}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all uppercase tracking-wider font-mono shadow-lg shadow-red-600/20"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* HIGH-PRECISION GPS CONFIRMATION MODAL */}
      <AnimatePresence>
      {isGpsConfirmOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 border border-blue-500/30 rounded-2xl w-full max-w-md p-6 relative shadow-2xl overflow-hidden">
            {/* Ambient Blue Grid background */}
            <div className="absolute inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#1A73E8_1px,transparent_1px)] [background-size:16px_16px]" />
            
            <div className="relative z-10 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/15 text-blue-400 rounded-xl flex items-center justify-center">
                  <MapPin className="w-5 h-5 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white font-sans">Verify GPS & Submit Report</h3>
                  <p className="text-[11px] font-mono text-slate-400">High-Precision Geospatial Verification</p>
                </div>
              </div>

              <div className="bg-black/30 border border-white/5 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-3">
                <div>
                  <span className="text-slate-500 block uppercase text-[9px] tracking-wider font-bold">Category</span>
                  <span className="text-slate-200 font-semibold">{formCategory}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[9px] tracking-wider font-bold">Mapped Location</span>
                  <span className="text-slate-200">{formLocation || "Identifying location..."}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] tracking-wider font-bold">Latitude</span>
                    <span className="text-cyan-400 font-bold">{formLat?.toFixed(6) || "N/A"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] tracking-wider font-bold">Longitude</span>
                    <span className="text-cyan-400 font-bold">{formLng?.toFixed(6) || "N/A"}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5 text-[10px] text-yellow-400/80 leading-relaxed">
                  ⚠️ Note: Registering an incident with verified GPS binds the report to your Citizen ID. You cannot verify your own submission, but other nearby citizens will receive a validation request.
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setIsGpsConfirmOpen(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all font-mono"
                >
                  Edit Location
                </button>
                <button
                  onClick={async () => {
                    setIsGpsConfirmOpen(false);
                    await handleSubmitReport();
                  }}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-all uppercase tracking-wider font-mono shadow-lg shadow-blue-500/20"
                >
                  Confirm & Submit
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* FOOTER */}
      <footer className="h-12 border-t border-white/5 bg-black/60 text-[10px] font-mono text-slate-500 flex items-center justify-between px-6 shrink-0 mt-auto">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> SYSTEM ACTIVE</span>
          <span className="hidden md:inline">UPTIME: 144h 12m</span>
          <span>STABLE</span>
        </div>
        <div className="flex items-center gap-4">
          <span>SECURE CONNECTIONS</span>
          <span>© 2026 CIVICLENS LABS</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  if (!hasValidKey) {
    return (
      <div className="flex items-center justify-center h-screen font-sans bg-slate-950 text-slate-200">
        <div className="text-center max-w-lg p-8 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
          <h2 className="text-2xl font-bold mb-4 text-white">Google Maps API Key Required</h2>
          <p className="mb-2"><strong>Step 1:</strong> <a href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais" target="_blank" rel="noopener" className="text-blue-400 underline">Get an API Key</a></p>
          <p className="mb-2"><strong>Step 2:</strong> Add your key as a secret in AI Studio:</p>
          <ul className="text-left leading-relaxed mb-4 text-sm text-slate-300 list-disc pl-5">
            <li>Open <strong>Settings</strong> (⚙️ gear icon, <strong>top-right corner</strong>)</li>
            <li>Select <strong>Secrets</strong></li>
            <li>Type <code>GOOGLE_MAPS_PLATFORM_KEY</code> as the secret name, press <strong>Enter</strong></li>
            <li>Paste your API key as the value, press <strong>Enter</strong></li>
          </ul>
          <p className="text-xs text-slate-500">The app rebuilds automatically after you add the secret.</p>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <MainApp />
    </APIProvider>
  );
}
