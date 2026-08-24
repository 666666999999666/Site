interface SeriesDeletionTransaction {
  post: {
    updateMany(args: {
      where: { seriesId: string }
      data: { seriesId: null; seriesOrder: null }
    }): Promise<{ count: number }>
  }
  series: {
    delete(args: { where: { id: string } }): Promise<unknown>
  }
}

export async function detachPostsAndDeleteSeries(
  transaction: SeriesDeletionTransaction,
  id: string
): Promise<number> {
  const detached = await transaction.post.updateMany({
    where: { seriesId: id },
    data: { seriesId: null, seriesOrder: null },
  })
  await transaction.series.delete({ where: { id } })
  return detached.count
}
