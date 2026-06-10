1. **Analyze Frontend Performance Opportunities**: Review memory about frontend React optimizations. Specifically, look at array filtering inside render loops.
2. **Review Memory Insights**:
   - Memory mentions: "When filtering arrays in React components (e.g., in list views), hoist invariant string operations like `filterText.toLowerCase()` outside the `.filter()` loop and wrap the calculation in `useMemo` to prevent redundant O(N) string operations on every render."
3. **Refactor `PersonList.tsx`**:
   - Wrap `filteredPersons` with `useMemo`.
   - Extract invariant string conversion (`filterText.toLowerCase()`) out of the `.filter` callback inside the `useMemo`.
   - Return memoized filtered list to prevent unnecessary re-computations and re-renders on unrelated state changes or re-renders.
4. **Read and Verify File Change**: Read the modified `src/renderer/src/components/PersonList.tsx` to verify changes.
5. **Pre-commit**: Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
6. **Submit**: Create PR with title "⚡ Bolt: [performance improvement]".
