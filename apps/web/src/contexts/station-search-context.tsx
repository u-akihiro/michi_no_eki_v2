import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type StationSearchContextValue = {
  query: string
  submittedQuery: string
  setQuery: (query: string) => void
  submitSearch: (query?: string) => void
}

const StationSearchContext = createContext<StationSearchContextValue | null>(
  null,
)

export function StationSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  function submitSearch(nextQuery = query) {
    setSubmittedQuery(nextQuery.trim())
  }

  const value = useMemo(
    () => ({
      query,
      submittedQuery,
      setQuery,
      submitSearch,
    }),
    [query, submittedQuery],
  )

  return (
    <StationSearchContext.Provider value={value}>
      {children}
    </StationSearchContext.Provider>
  )
}

export function useStationSearch() {
  const context = useContext(StationSearchContext)

  if (context === null) {
    throw new Error(
      'useStationSearch must be used within StationSearchProvider',
    )
  }

  return context
}
