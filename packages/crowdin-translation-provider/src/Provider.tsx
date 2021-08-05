import React, { createContext, useCallback, useEffect, useReducer, useRef } from "react";
import { StringTranslations } from "@crowdin/crowdin-api-client";
import { EN, languages } from "./languages";
import reducer from "./reducer";
import {
  ContextApi,
  ProviderProps,
  ProviderState,
  LanguageCode,
  CrowdinTranslation,
  ContextData,
  Language,
} from "./types";

const LS_KEY = "pancakeswap_lang";
const MAX_RECORDS_TO_FETCH = 300;

export const TranslationContext = createContext<ContextApi | undefined>(undefined);

const getInitialState = (initialState: ProviderState) => {
  try {
    const localLanguageCode = localStorage.getItem(LS_KEY) as LanguageCode;

    if (!localLanguageCode) {
      return initialState;
    }

    if (!languages[localLanguageCode]) {
      return initialState;
    }

    return {
      ...initialState,
      currentLanguage: languages[localLanguageCode],
    };
  } catch {
    return initialState;
  }
};

export const TranslationProvider: React.FC<ProviderProps> = ({
  initialLanguage = EN,
  projectId,
  fileId,
  apiKey,
  children,
}) => {
  const fallbacks = useRef(new Map<number, string>());
  const crowdinApi = useRef(
    new StringTranslations({
      token: apiKey,
    })
  );
  const [state, dispatch] = useReducer(
    reducer,
    {
      isFetching: true,
      currentLanguage: initialLanguage,
      translations: {},
    },
    getInitialState
  );
  const { currentLanguage, translations } = state;
  const currentTranslationSet = translations[currentLanguage.code];

  const fetchLanguageTranslations = useCallback(
    async (code: LanguageCode) => {
      try {
        dispatch({ type: "FETCH_START" });

        const response = await crowdinApi.current.listLanguageTranslations(
          projectId,
          code,
          undefined,
          fileId,
          MAX_RECORDS_TO_FETCH
        );
        const crowdinTranslations = response.data.reduce((accum, responseObject) => {
          const { stringId } = responseObject.data as CrowdinTranslation;

          return {
            ...accum,
            [stringId]: responseObject.data,
          };
        }, {});

        dispatch({ type: "FETCH_SUCCEEDED", translations: crowdinTranslations, code });
      } catch (error) {
        // TODO: dispatch error
        console.error("An error occurred fetching translations:", error);
      }
    },
    [crowdinApi, projectId, fileId, dispatch]
  );

  const translate = useCallback(
    (stringId: number, fallback: string, data?: ContextData) => {
      const fallbackWhileLoading = fallbacks.current.get(stringId) || fallback;

      // Fall back to current translation shown while fetching new language
      if (!currentTranslationSet) {
        return fallbackWhileLoading;
      }

      // If no translation exists after loading new language fallback to
      // the one provided by the consumer
      if (!currentTranslationSet[stringId]) {
        return fallback;
      }

      const translatedText = currentTranslationSet[stringId].text;
      const includesVariable = translatedText.includes("%");

      if (includesVariable) {
        let interpolatedText = translatedText;

        if (!data) {
          return fallbackWhileLoading;
        }

        Object.keys(data).forEach((dataKey) => {
          const templateKey = new RegExp(`%${dataKey}%`, "g");
          interpolatedText = interpolatedText.replace(templateKey, data[dataKey].toString());
        });

        return interpolatedText;
      }

      fallbacks.current.set(stringId, translatedText);
      return translatedText;
    },
    [currentTranslationSet]
  );

  const setLanguage = async (language: Language) => {
    dispatch({ type: "SET_LANG", language });
    localStorage.setItem(LS_KEY, language.code);
  };

  const setLanguageByCode = (code: LanguageCode) => {
    const language = languages[code];
    setLanguage(language);
  };

  useEffect(() => {
    fetchLanguageTranslations(currentLanguage.code);
  }, [currentLanguage.code, fetchLanguageTranslations]);

  return (
    <TranslationContext.Provider
      value={{ ...state, languages, setLanguage, setLanguageByCode, fetchLanguageTranslations, t: translate }}
    >
      {children}
    </TranslationContext.Provider>
  );
};
