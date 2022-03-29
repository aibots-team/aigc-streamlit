/**
 * @license
 * Copyright 2018-2022 Streamlit Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, {
  ReactElement,
  useState,
  useEffect,
  useLayoutEffect,
} from "react"
import {
  DataEditor as GlideDataEditor,
  GridCell,
  GridCellKind,
  GridColumn,
  DataEditorProps,
  useColumnSizer,
  Rectangle,
  CellArray,
  DataEditorRef,
} from "@glideapps/glide-data-grid"
import { useTheme } from "@emotion/react"

import withFullScreenWrapper from "src/hocs/withFullScreenWrapper"
import { Quiver } from "src/lib/Quiver"
import { logError } from "src/lib/log"
import { Theme } from "src/theme"

import { getCellTemplate, fillCellTemplate } from "./DataGridCells"
import ThemedDataGridContainer, {
  createDataGridTheme,
} from "./DataGridContainer"

const ROW_HEIGHT = 35
const MIN_COLUMN_WIDTH = 35
const MAX_COLUMN_WIDTH = 500

/**
 * The GridColumn type extended with a function to get a template of the given type.
 */
type GridColumnWithCellTemplate = GridColumn & {
  getTemplate(): GridCell
}

/**
 * Returns a list of glide-data-grid compatible columns based on a Quiver instance.
 */
function getColumns(element: Quiver): GridColumnWithCellTemplate[] {
  const columns: GridColumnWithCellTemplate[] = []

  const numIndices = element.types?.index?.length ?? 0
  const numColumns = element.columns?.[0]?.length ?? 0

  if (!numIndices && !numColumns) {
    // Tables that don't have any columns cause an exception in glide-data-grid.
    // As a workaround, we are adding an empty index column in this case.
    columns.push({
      id: `empty-index`,
      title: "",
      hasMenu: false,
      getTemplate: () => {
        return getCellTemplate(GridCellKind.RowID, true)
      },
    } as GridColumnWithCellTemplate)
    return columns
  }

  for (let i = 0; i < numIndices; i++) {
    columns.push({
      id: `index-${i}`,
      // Indices currently have empty titles:
      title: "",
      hasMenu: false,
      getTemplate: () => {
        return getCellTemplate(GridCellKind.RowID, true)
      },
    } as GridColumnWithCellTemplate)
  }

  for (let i = 0; i < numColumns; i++) {
    const columnTitle = element.columns[0][i]

    columns.push({
      id: `column-${i}`,
      title: columnTitle,
      hasMenu: false,
      getTemplate: () => {
        return getCellTemplate(GridCellKind.Text, true)
      },
    } as GridColumnWithCellTemplate)
  }
  return columns
}

/**
 * Create return type for useDataLoader hook based on the DataEditorProps.
 */
type DataLoaderReturn = { numRows: number } & Pick<
  DataEditorProps,
  "columns" | "getCellContent" | "onColumnResized"
>

export function useAutoWidthAdjuster(
  numRows: number,
  columns: DataEditorProps["columns"],
  getCellContent: DataEditorProps["getCellContent"]
): number {
  const theme: Theme = useTheme()

  /**
   * Implements the callback used by glide-data-grid to get all the cells selected by the user.
   * This is required to activate the copy to clipboard feature.
   */
  const getCellsForSelection = React.useCallback(
    (selection: Rectangle): CellArray => {
      const result: GridCell[][] = []

      for (let { y } = selection; y < selection.y + selection.height; y++) {
        const row: GridCell[] = []
        for (let { x } = selection; x < selection.x + selection.width; x++) {
          row.push(getCellContent([x, y]))
        }
        result.push(row)
      }

      return result
    },
    [getCellContent]
  )

  const sizedColumns = useColumnSizer(
    columns,
    numRows,
    getCellsForSelection,
    MIN_COLUMN_WIDTH,
    MAX_COLUMN_WIDTH,
    createDataGridTheme(theme),
    new AbortController()
  )

  // Return the accumulated width from all columns:
  return sizedColumns.reduce((acc, column) => acc + column.width, 0)
}

/**
 * A custom hook that handles all data loading capabilities for the interactive data table.
 * This also includes the logic to load and configure columns.
 * And features that influence the data representation and column configuration
 * such as column resizing, sorting, etc.
 */
export function useDataLoader(element: Quiver): DataLoaderReturn {
  // The columns with the corresponding empty template for every type:
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [columns, setColumns] = useState(() => getColumns(element))

  // Number of rows of the table minus 1 for the header row:
  const numRows = element.dimensions.rows - 1

  // TODO(lukasmasuch): Add sorting and eventually selection functionality here.

  const onColumnResized = React.useCallback(
    (column: GridColumn, newSize: number) => {
      setColumns(prevColumns => {
        const index = prevColumns.findIndex(ci => ci.id === column.id)
        const updatedColumns = [...prevColumns]
        updatedColumns.splice(index, 1, {
          ...prevColumns[index],
          width: newSize,
        })
        return updatedColumns
      })
    },
    [columns]
  )

  const getCellContent = React.useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const cellTemplate = columns[col].getTemplate()
      if (col > columns.length - 1 || row > numRows - 1) {
        // TODO(lukasmasuch): This should never happen
        return cellTemplate
      }
      try {
        // Quiver has the index in 1 column and the header in first row
        const quiverCell = element.getCell(row + 1, col)
        return fillCellTemplate(cellTemplate, quiverCell)
      } catch (error) {
        // This should not happen in read-only table.
        logError(error)
        return cellTemplate
      }
    },
    [columns, numRows, element]
  )

  return {
    numRows,
    columns,
    getCellContent,
    onColumnResized,
  }
}
export interface DataGridProps {
  element: Quiver
  height?: number
  width: number
}

function DataGrid({
  element,
  height: propHeight,
  width: propWidth,
}: DataGridProps): ReactElement {
  const { numRows, columns, getCellContent, onColumnResized } = useDataLoader(
    element
  )

  const [tableWidth, setTableWidth] = useState(propWidth)

  const dataEditorRef = React.useRef<DataEditorRef>(null)

  useLayoutEffect(() => {
    setTimeout(() => {
      const firstCell = dataEditorRef.current?.getBounds(0, 0)
      const lastCell = dataEditorRef.current?.getBounds(
        columns.length - 1,
        numRows - 1
      )
      if (firstCell && lastCell) {
        const fullTableWdith = lastCell.x - firstCell.x + lastCell.width + 2
        const fullTableHeight = lastCell.y - firstCell.y + lastCell.height + 2

        if (fullTableWdith < propWidth) {
          setTableWidth(fullTableWdith)
        } else {
          console.log(fullTableWdith)
          setTableWidth(propWidth)
        }
      } else {
        console.log("No first or last cell.")
        setTableWidth(propWidth)
      }
    }, 0)
  })

  // Automatic table width calculation based on all columns width
  // const totalColumnsWidth = useAutoWidthAdjuster(
  //   numRows,
  //   columns,
  //   getCellContent
  // )

  // Automatic table height calculation: numRows +1 because of header, and +3 pixels for borders
  const height = propHeight || Math.min((numRows + 1) * ROW_HEIGHT + 3, 400)

  // Calculate min height for the resizable container. header + one column, and +3 pixels for borders
  const minHeight = 2 * ROW_HEIGHT + 3

  return (
    <ThemedDataGridContainer
      width={tableWidth}
      height={height}
      minHeight={minHeight}
    >
      <GlideDataEditor
        ref={dataEditorRef}
        columns={columns}
        rows={numRows}
        minColumnWidth={MIN_COLUMN_WIDTH}
        maxColumnWidth={MAX_COLUMN_WIDTH}
        rowHeight={ROW_HEIGHT}
        headerHeight={ROW_HEIGHT}
        getCellContent={getCellContent}
        onColumnResized={onColumnResized}
        smoothScrollX={true}
        // Only activate smooth mode for vertical scrolling for large tables:
        smoothScrollY={numRows < 100000}
        // Show borders between cells:
        verticalBorder={true}
        // Activate copy to clipboard functionality:
        getCellsForSelection={true}
        // Deactivate row markers and numbers:
        rowMarkers={"none"}
        // Deactivate selections:
        rangeSelect={"none"}
        columnSelect={"none"}
        rowSelect={"none"}
        // Activate search:
        keybindings={{ search: true }}
      />
    </ThemedDataGridContainer>
  )
}

export default withFullScreenWrapper(DataGrid)
