import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export function useUserSettings() {
  const { user } = useAuth();

  const getSignature = async () => {
    if (!user) return '';
    const snap = await getDoc(doc(db, 'userSettings', user.uid));
    return snap.exists() ? (snap.data().signature ?? '') : '';
  };

  const saveSignature = async (signature) => {
    if (!user) return;
    await setDoc(doc(db, 'userSettings', user.uid), { signature }, { merge: true });
  };

  return { getSignature, saveSignature };
}
