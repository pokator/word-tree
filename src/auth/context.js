import { createContext } from "react";

export const AuthContext = createContext({ user: null, session: null, loading: false });
