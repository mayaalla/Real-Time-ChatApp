
import {create} from "zustand";


// user public data shape
export interface AuthUser{
    id:string;
    username:string;
    avatarAddress:string | null;
    lastSeen: string | null;
}

// full shape of the store data + action

interface AuthState {
    user: AuthUser | null;
    accessToken : string | null;
    isCheckingAuth : boolean

    // actionns
    setSession: (user: AuthUser, token: string) => void;
    clearSession : () => void;
    setToken : (token: string) => void;
    setIscheckingAuth : (value:boolean) => void
}

export const useAuthStore = create<AuthState>(
    (set) => ({
        // inti values whene the page loead for first time
        user:null,
        accessToken:null,
        isCheckingAuth: true,

        // call this after a successful login OR a successful session restore.
        setSession : (user, token) =>
            set({user, accessToken : token, isCheckingAuth:false}),
        // casll this on logout or whene the session expire
        clearSession: () => 
            set({user:null, accessToken:null, isCheckingAuth:false}),

        // call this when you get a new access token from a referesh endpoint
        setToken: (token) => 
            set({accessToken:token}),
        
        // call this to control the still checking flag
        setIscheckingAuth: (value) =>
            set({isCheckingAuth: value}),
    }))