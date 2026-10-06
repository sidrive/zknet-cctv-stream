import { useCallback, useEffect, useState } from 'react'
import { api, type Catalog } from './api'

export function useCatalog() {
  const [data, setData] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    api.catalog().then(setData).catch((e) => setError(e.message))
  }, [])
  useEffect(reload, [reload])
  useEffect(() => {
    if (data) document.title = data.site.site_title
  }, [data])
  return { data, error, reload }
}
