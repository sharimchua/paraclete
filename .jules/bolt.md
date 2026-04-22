## 2024-05-19 - Use useMemo for array and object lookup in render loops
**Learning:** O(N) array lookups (such as `.find()`) inside render loops can cause performance issues and should be memoized using `useMemo` to prevent unnecessary re-computations and re-renders.
**Action:** When finding an element in an array or combining arrays within a component's render function, wrap the computation in `useMemo` with the correct dependency array.
