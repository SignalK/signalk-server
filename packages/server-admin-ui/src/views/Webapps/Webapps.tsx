import {
  useEffect,
  useMemo,
  Suspense,
  createElement,
  ComponentType,
  CSSProperties
} from 'react'
import {
  useWebapps,
  useAddons,
  useStore,
  useWebappSortMode,
  useWebappCustomOrder,
  useWebappLastUsed
} from '../../store'
import { fetchWebapps } from '../../actions'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGripVertical } from '@fortawesome/free-solid-svg-icons/faGripVertical'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ADDON_PANEL, toLazyDynamicComponent } from './dynamicutilities'
import Webapp from './Webapp'
import { applyWebappSort, type WebappSortMode } from '../../utils/webappSort'

const DRAG_ACTIVATION_DISTANCE_PX = 4
const TOUCH_ACTIVATION_DELAY_MS = 150
const TOUCH_ACTIVATION_TOLERANCE_PX = 5
const DRAGGING_OPACITY = 0.6
const DRAGGING_Z_INDEX = 2
const HANDLE_Z_INDEX = 3
const HANDLE_COLOR = '#8a93a2'

interface WebAppInfo {
  name: string
  description?: string
  keywords?: string[]
  signalk?: {
    displayName?: string
    appIcon?: string
  }
}

interface AddonModule {
  name: string
}

interface AddonPanelProps {
  webapps: WebAppInfo[]
  addons: AddonModule[]
}

interface SortableWebappColProps {
  webAppInfo: WebAppInfo
  onLaunch: () => void
}

// In custom mode each grid cell becomes sortable. The card itself stays a
// plain link — dragging happens only via the grip handle, so a drag can
// never be misread as a navigation (and vice versa).
function SortableWebappCol({ webAppInfo, onLaunch }: SortableWebappColProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: webAppInfo.name })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? DRAGGING_OPACITY : 1,
    zIndex: isDragging ? DRAGGING_Z_INDEX : undefined,
    position: 'relative'
  }

  const handleStyle: CSSProperties = {
    // Without touch-action: none, iOS Safari treats a vertical drag on
    // the handle as page scroll and DnD never starts.
    touchAction: 'none',
    position: 'absolute',
    top: '0.5rem',
    right: '1.25rem',
    zIndex: HANDLE_Z_INDEX,
    border: 'none',
    background: 'transparent',
    color: HANDLE_COLOR,
    cursor: 'grab',
    padding: '0.25rem 0.5rem'
  }

  return (
    <Col xs="12" md="12" lg="6" xl="4" ref={setNodeRef} style={style}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        style={handleStyle}
        {...attributes}
        {...listeners}
        aria-label={`Drag ${webAppInfo.signalk?.displayName || webAppInfo.name}`}
      >
        <FontAwesomeIcon icon={faGripVertical} />
      </button>
      <Webapp webAppInfo={webAppInfo} onLaunch={onLaunch} />
    </Col>
  )
}

export default function Webapps() {
  const webapps = useWebapps() as WebAppInfo[]
  const addons = useAddons() as AddonModule[]
  const sortMode = useWebappSortMode()
  const customOrder = useWebappCustomOrder()
  const lastUsed = useWebappLastUsed()
  const initWebappSort = useStore((s) => s.initWebappSort)
  const setWebappSortMode = useStore((s) => s.setWebappSortMode)
  const setWebappCustomOrder = useStore((s) => s.setWebappCustomOrder)
  const recordWebappLaunch = useStore((s) => s.recordWebappLaunch)

  useEffect(() => {
    fetchWebapps()
    void initWebappSort()
  }, [initWebappSort])

  const visibleWebapps = useMemo(
    () =>
      webapps.filter(
        (webAppInfo) => webAppInfo.name !== '@signalk/server-admin-ui'
      ),
    [webapps]
  )

  const sortedWebapps = useMemo(
    () => applyWebappSort(visibleWebapps, sortMode, customOrder, lastUsed),
    [visibleWebapps, sortMode, customOrder, lastUsed]
  )

  const displayedNames = useMemo(
    () => sortedWebapps.map((webAppInfo) => webAppInfo.name),
    [sortedWebapps]
  )

  const handleModeChange = (mode: WebappSortMode) => {
    if (mode === 'custom' && customOrder.length === 0) {
      // First entry into custom mode: seed with the order currently on
      // screen so dragging starts from what the user sees.
      setWebappCustomOrder(displayedNames)
    }
    setWebappSortMode(mode)
  }

  // PointerSensor handles mouse + most pen/pointer-aware browsers, but
  // iOS Safari maps touch into pointer events tied to scroll gestures
  // and the drag never starts. A separate TouchSensor with a hold delay
  // makes touch DnD reliable and keeps a tap from being misread as a
  // drag.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_ACTIVATION_DELAY_MS,
        tolerance: TOUCH_ACTIVATION_TOLERANCE_PX
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = displayedNames.indexOf(String(active.id))
    const to = displayedNames.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const next = [...displayedNames]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    // Persist the full on-screen order. Stored names that are currently
    // hidden (e.g. a disabled plugin's webapp) keep a slot by being
    // re-appended, so they come back ranked instead of vanishing from
    // the stored order.
    const hidden = customOrder.filter((name) => !displayedNames.includes(name))
    setWebappCustomOrder([...next, ...hidden])
  }

  const addonComponents = useMemo(
    () =>
      addons.map((md) => ({
        name: md.name,
        Component: toLazyDynamicComponent(
          md.name,
          ADDON_PANEL
        ) as ComponentType<AddonPanelProps>
      })),
    [addons]
  )

  const grid = (
    <div className="row">
      {sortedWebapps.map((webAppInfo) =>
        sortMode === 'custom' ? (
          <SortableWebappCol
            key={webAppInfo.name}
            webAppInfo={webAppInfo}
            onLaunch={() => recordWebappLaunch(webAppInfo.name)}
          />
        ) : (
          <Col xs="12" md="12" lg="6" xl="4" key={webAppInfo.name}>
            <Webapp
              webAppInfo={webAppInfo}
              onLaunch={() => recordWebappLaunch(webAppInfo.name)}
            />
          </Col>
        )
      )}
    </div>
  )

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Header className="d-flex justify-content-between align-items-center">
          <span>Webapps</span>
          <Form.Select
            size="sm"
            style={{ width: 'auto' }}
            value={sortMode}
            onChange={(e) => handleModeChange(e.target.value as WebappSortMode)}
            aria-label="Sort order"
          >
            <option value="name">A-Z</option>
            <option value="custom">Custom order</option>
            <option value="lastUsed">Last used</option>
          </Form.Select>
        </Card.Header>
        <Card.Body>
          {sortMode === 'custom' ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayedNames}
                strategy={rectSortingStrategy}
              >
                {grid}
              </SortableContext>
            </DndContext>
          ) : (
            grid
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>Addons</Card.Header>
        <Card.Body>
          {addonComponents.map(({ name, Component }) => (
            <Suspense key={name} fallback="Loading...">
              {createElement(Component, { webapps, addons })}
            </Suspense>
          ))}
        </Card.Body>
      </Card>
    </div>
  )
}
